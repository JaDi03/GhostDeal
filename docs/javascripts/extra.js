// GhostDeal Mermaid theming.
// Material renders superfences mermaid into a CLOSED shadow root that page CSS
// and querySelector cannot reach, and it renders once with the colors baked at
// load time. We therefore (a) capture every fence source before Material swaps
// the <pre> out, (b) re-render the diagrams ourselves as plain inline SVGs, and
// (c) recolor through CSS variables so nothing is ever baked per theme.

function gdSchemeIsDark() {
  return document.body.getAttribute("data-md-color-scheme") === "slate";
}

function gdMermaidVars(dark) {
  const text = dark ? "#fafafa" : "#14110e";
  const raised = dark ? "#141414" : "#ffffff";
  const raised2 = dark ? "#1a1a1a" : "#efeae3";
  const line = dark ? "#262626" : "#e4ddd4";
  return {
    darkMode: dark,
    background: raised,
    fontFamily: "Space Grotesk, Helvetica Neue, Arial, sans-serif",
    primaryColor: raised2,
    primaryTextColor: text,
    primaryBorderColor: line,
    secondaryColor: raised2,
    secondaryTextColor: text,
    secondaryBorderColor: line,
    tertiaryColor: raised2,
    tertiaryTextColor: text,
    tertiaryBorderColor: line,
    lineColor: "#c53400",
    textColor: text,
    mainBkg: raised2,
    nodeBorder: line,
    clusterBkg: raised,
    clusterBorder: line,
    titleColor: text,
    nodeTextColor: text,
    edgeLabelBackground: raised,
    noteBkgColor: raised2,
    noteTextColor: text,
    noteBorderColor: "#c53400",
    actorBkg: raised2,
    actorBorder: line,
    actorTextColor: text,
    actorLineColor: line,
    signalColor: "#c53400",
    signalTextColor: text,
    labelBoxBkgColor: raised2,
    labelBoxBorderColor: "#c53400",
    labelTextColor: text,
    loopTextColor: text,
    activationBkgColor: raised2,
    activationBorderColor: "#c53400",
    sequenceNumberColor: "#fafafa",
    labelColor: text,
    altBackground: raised,
  };
}

function gdTextSelectorList() {
  return [
    ".messageText",
    ".messageText > tspan",
    "text.messageText",
    ".noteText",
    ".noteText > tspan",
    ".loopText",
    ".loopText > tspan",
    ".labelText",
    ".labelText > tspan",
    ".sectionTitle",
    "text.actor",
    "text.actor > tspan",
    ".nodeLabel",
    ".nodeLabel > tspan",
    ".node .label",
    ".node span",
    ".node foreignObject",
    ".node foreignObject div",
    ".node foreignObject span",
    ".label foreignObject div",
    ".cluster-label",
    ".cluster-label > tspan",
    ".cluster-label span",
    ".cluster-label foreignObject",
    ".cluster-label foreignObject div",
    ".cluster-label foreignObject span",
    ".edgeLabel",
    ".edgeLabel > tspan",
    ".edgeLabel span",
    ".edgeLabel foreignObject",
    ".edgeLabel foreignObject div",
    ".edgeLabel foreignObject span",
    ".nodeText",
    ".nodeText > tspan",
    "text",
  ];
}

function gdSvgStyleRules(prefix) {
  var p = prefix || "";
  var withP = function (sel) {
    return sel
      .split(",")
      .map(function (s) {
        return p + s.trim();
      })
      .join(",");
  };
  return [
    withP(
      ".actor, rect.actor, .note, rect.note, .labelBox, rect.labelBox, .activation0, .activation1, .activation2, .node rect, .node polygon, .node circle, .cluster rect"
    ) + " { fill: var(--gd-raised2) !important; }",
    withP(".actor, rect.actor, .node rect, .node polygon, .node circle, .cluster rect") +
      " { stroke: var(--gd-line) !important; }",
    withP(".note, rect.note, .labelBox, rect.labelBox") +
      " { stroke: var(--gd-orange) !important; }",
    withP(gdTextSelectorList().join(", ")) +
      " { fill: var(--gd-text) !important; color: var(--gd-text) !important; stroke: none !important; }",
    withP(".sequenceNumber") + " { fill: #fafafa !important; stroke: none !important; }",
  ].join(" ");
}

function gdMermaidThemeCSS() {
  return gdSvgStyleRules("");
}

function gdApplyMermaidTextTheme() {
  document.querySelectorAll(".mermaid svg").forEach(function (svg) {
    var style = svg.querySelector("style[data-gd-text]");
    if (!style) {
      style = document.createElement("style");
      style.setAttribute("data-gd-text", "1");
      svg.appendChild(style);
    }
    var id = svg.id ? "#" + svg.id.replace(/([^a-zA-Z0-9_-])/g, "\\$1") : "";
    style.textContent = gdSvgStyleRules(id ? id + " " : "");
    // Never bake a literal color here: the CSS variables above must stay the
    // single source of truth so a scheme switch needs no re-render.
  });
}

// Sources must be grabbed before Material replaces <pre class="mermaid"> with
// its closed-shadow-root div. Keyed per path + diagram index.
var gdSrcCache = Object.create(null);

function gdCaptureMermaidSources() {
  var pres = document.querySelectorAll("pre.mermaid");
  for (var i = 0; i < pres.length; i++) {
    var src = (pres[i].textContent || "").trim();
    if (src) gdSrcCache[location.pathname + ":" + i] = src;
  }
  var blocks = document.querySelectorAll(".mermaid");
  for (var j = 0; j < blocks.length; j++) {
    var el = blocks[j];
    if (el.dataset.gdSrc) {
      gdSrcCache[location.pathname + ":" + j] = el.dataset.gdSrc;
      continue;
    }
    var code = el.querySelector("code");
    var text = code ? code.textContent : el.textContent;
    if (text && text.trim()) {
      el.dataset.gdSrc = text.trim();
      gdSrcCache[location.pathname + ":" + j] = text.trim();
    }
  }
}

var gdRenderPending = false;

function gdScheduleRender() {
  if (gdRenderPending) return;
  gdRenderPending = true;
  requestAnimationFrame(function () {
    gdRenderPending = false;
    gdRenderMermaid();
  });
}

async function gdRenderMermaid() {
  if (typeof mermaid === "undefined") return;
  gdCaptureMermaidSources();
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    htmlLabels: false,
    flowchart: { htmlLabels: false, curve: "linear" },
    themeCSS: gdMermaidThemeCSS(),
    themeVariables: gdMermaidVars(gdSchemeIsDark()),
  });
  var nodes = [];
  document.querySelectorAll(".mermaid").forEach(function (el, i) {
    var src = el.dataset.gdSrc || gdSrcCache[location.pathname + ":" + i] || "";
    if (!src) return; // Material's closed-shadow div: nothing we can inject.
    if (!el.querySelector("svg") || el.getAttribute("data-gd-stale") === "1") {
      // Always render into a fresh div and replace the existing node: when the
      // node is the original <pre>, Material's later replacement of that (now
      // detached) pre can no longer swallow our rendered SVG.
      var host = document.createElement("div");
      host.className = el.className || "mermaid";
      host.dataset.gdSrc = src;
      host.textContent = src;
      el.replaceWith(host);
      nodes.push(host);
    }
  });
  if (nodes.length) {
    await mermaid.run({ nodes: nodes });
  }
  gdApplyMermaidTextTheme();
}

if (typeof mermaid !== "undefined") {
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    htmlLabels: false,
    flowchart: { htmlLabels: false, curve: "linear" },
    themeCSS: gdMermaidThemeCSS(),
  });
}

// Grab fence sources as early as this script evaluates (defer: DOM is parsed,
// Material has not swapped the <pre> yet), and keep grabbing on every DOM
// change so navigation.instant pages are covered too.
gdCaptureMermaidSources();
new MutationObserver(gdCaptureMermaidSources).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

var gdWatchingScheme = false;

document$.subscribe(function () {
  gdRenderMermaid();
  requestAnimationFrame(function () {
    gdApplyMermaidTextTheme();
    setTimeout(gdApplyMermaidTextTheme, 250);
  });
  if (gdWatchingScheme) return;
  gdWatchingScheme = true;
  new MutationObserver(function () {
    // Mark our own nodes stale so the scheme switch forces a re-render with
    // the new themeVariables.
    document.querySelectorAll(".mermaid[data-gd-src]").forEach(function (el) {
      el.setAttribute("data-gd-stale", "1");
    });
    gdScheduleRender();
  }).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-md-color-scheme"],
  });
});
