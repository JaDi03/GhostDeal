use starknet::ContractAddress;

// Must match privacy::objects::OpenNoteDeposit (positional Serde).
#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub struct OpenNoteDeposit {
    pub note_id: felt252,
    pub token: ContractAddress,
    pub amount: u128,
}

// GhostDeal escrow. Pattern from the unofficial STRK20 escrow helper
// (strk20-by-example). Not in the starknet-privacy monorepo. Not audited.
#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct CommitmentEntry {
    pub token: ContractAddress,
    pub amount: u128,
    pub refund_hash: felt252,
    pub closed: bool,
}

#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub enum EscrowOperation {
    Deposit,
    Claim,
    Cancel,
}

pub const ESCROW_COMMITMENT_TAG: felt252 = 'ESCROW_COMMITMENT_TAG:V1';

pub fn compute_commitment_hash(secret: felt252) -> felt252 {
    core::poseidon::poseidon_hash_span([ESCROW_COMMITMENT_TAG, secret].span())
}

#[starknet::interface]
pub trait IErc20<TState> {
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn approve(ref self: TState, spender: ContractAddress, amount: u256) -> bool;
}

#[starknet::interface]
pub trait IEscrow<TState> {
    fn get_commitment(self: @TState, commitment_hash: felt252) -> CommitmentEntry;
    // Called by the privacy pool via selector!("privacy_invoke").
    // Deposit: park tokens. commitment_hash = seller claim hash. refund_hash =
    // buyer cancel hash. Returns empty span. secret and note_id ignored.
    // Claim: secret is the seller preimage. Credits note_id. Other args ignored.
    // Cancel: secret is the buyer refund preimage. Credits note_id.
    fn privacy_invoke(
        ref self: TState,
        operation: EscrowOperation,
        commitment_hash: felt252,
        refund_hash: felt252,
        token: ContractAddress,
        amount: u128,
        secret: felt252,
        note_id: felt252,
    ) -> Span<OpenNoteDeposit>;
}

#[starknet::contract]
mod Escrow {
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use super::{
        CommitmentEntry, EscrowOperation, IErc20Dispatcher, IErc20DispatcherTrait, OpenNoteDeposit,
        compute_commitment_hash,
    };

    mod errors {
        pub const CALLER_NOT_PRIVACY: felt252 = 'CALLER_NOT_PRIVACY';
        pub const ZERO_COMMITMENT_HASH: felt252 = 'ZERO_COMMITMENT_HASH';
        pub const ZERO_REFUND_HASH: felt252 = 'ZERO_REFUND_HASH';
        pub const ZERO_TOKEN: felt252 = 'ZERO_TOKEN';
        pub const ZERO_AMOUNT: felt252 = 'ZERO_AMOUNT';
        pub const COMMITMENT_EXISTS: felt252 = 'COMMITMENT_EXISTS';
        pub const COMMITMENT_NOT_FOUND: felt252 = 'COMMITMENT_NOT_FOUND';
        pub const ALREADY_CLOSED: felt252 = 'ALREADY_CLOSED';
        pub const BAD_SECRET: felt252 = 'BAD_SECRET';
    }

    #[storage]
    struct Storage {
        privacy_contract: ContractAddress,
        commitments: Map<felt252, CommitmentEntry>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, privacy_contract: ContractAddress) {
        self.privacy_contract.write(privacy_contract);
    }

    #[abi(embed_v0)]
    impl EscrowImpl of super::IEscrow<ContractState> {
        fn get_commitment(self: @ContractState, commitment_hash: felt252) -> CommitmentEntry {
            self.commitments.read(commitment_hash)
        }

        fn privacy_invoke(
            ref self: ContractState,
            operation: EscrowOperation,
            commitment_hash: felt252,
            refund_hash: felt252,
            token: ContractAddress,
            amount: u128,
            secret: felt252,
            note_id: felt252,
        ) -> Span<OpenNoteDeposit> {
            let privacy_addr = self.privacy_contract.read();
            assert(get_caller_address() == privacy_addr, errors::CALLER_NOT_PRIVACY);

            match operation {
                EscrowOperation::Deposit => {
                    assert(commitment_hash != 0, errors::ZERO_COMMITMENT_HASH);
                    assert(refund_hash != 0, errors::ZERO_REFUND_HASH);
                    assert(commitment_hash != refund_hash, errors::ZERO_REFUND_HASH);
                    assert(token.is_non_zero(), errors::ZERO_TOKEN);
                    assert(amount != 0, errors::ZERO_AMOUNT);

                    let existing = self.commitments.read(commitment_hash);
                    assert(existing.token.is_zero(), errors::COMMITMENT_EXISTS);

                    self
                        .commitments
                        .write(
                            commitment_hash,
                            CommitmentEntry {
                                token, amount, refund_hash, closed: false,
                            },
                        );

                    // Tokens already transferred by the pool. Park them here.
                    array![].span()
                },
                EscrowOperation::Claim => {
                    let key = compute_commitment_hash(secret);
                    close_and_credit(ref self, key, privacy_addr, note_id)
                },
                EscrowOperation::Cancel => {
                    let entry = self.commitments.read(commitment_hash);
                    assert(entry.token.is_non_zero(), errors::COMMITMENT_NOT_FOUND);
                    assert(
                        compute_commitment_hash(secret) == entry.refund_hash, errors::BAD_SECRET,
                    );
                    close_and_credit(ref self, commitment_hash, privacy_addr, note_id)
                },
            }
        }
    }

    fn close_and_credit(
        ref self: ContractState,
        commitment_hash: felt252,
        privacy_addr: ContractAddress,
        note_id: felt252,
    ) -> Span<OpenNoteDeposit> {
        let entry = self.commitments.read(commitment_hash);
        assert(entry.token.is_non_zero(), errors::COMMITMENT_NOT_FOUND);
        assert(!entry.closed, errors::ALREADY_CLOSED);

        self
            .commitments
            .write(
                commitment_hash,
                CommitmentEntry { closed: true, ..entry },
            );

        IErc20Dispatcher { contract_address: entry.token }
            .approve(privacy_addr, entry.amount.into());

        array![OpenNoteDeposit { note_id, token: entry.token, amount: entry.amount }].span()
    }
}
