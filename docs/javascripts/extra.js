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

function gdSchemeIsDark() {
  return document.body.getAttribute("data-md-color-scheme") === "slate";
}

function gdMermaidThemeCSS() {
  return [
    ".actor,rect.actor,.note,rect.note,.labelBox,rect.labelBox,.activation0,.activation1,.activation2,.node rect,.node polygon { fill: var(--gd-raised2) !important; }",
    ".actor,rect.actor,.node rect,.node polygon { stroke: var(--gd-line) !important; }",
    ".note,rect.note,.labelBox,rect.labelBox,.activation0,.activation1,.activation2 { stroke: var(--gd-orange) !important; }",
    ".messageText,.messageText>tspan,.noteText,.noteText>tspan,.loopText,.loopText>tspan,.labelText,.labelText>tspan,.sectionTitle,.sectionTitle>tspan,text.actor>tspan,text.actor,.nodeLabel,.node .label,.node span,.label foreignObject,.label foreignObject div,.label foreignObject span { fill: var(--gd-text) !important; color: var(--gd-text) !important; stroke: none !important; }",
    ".sequenceNumber { fill: #fafafa !important; stroke: none !important; }",
  ].join(" ");
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
    var p = id ? id + " " : "";
    style.textContent =
      p +
      ".actor," +
      p +
      "rect.actor," +
      p +
      ".note," +
      p +
      "rect.note," +
      p +
      ".labelBox," +
      p +
      "rect.labelBox," +
      p +
      ".activation0," +
      p +
      ".activation1," +
      p +
      ".activation2," +
      p +
      ".node rect," +
      p +
      ".node polygon { fill: var(--gd-raised2) !important; }" +
      p +
      ".actor," +
      p +
      "rect.actor," +
      p +
      ".node rect," +
      p +
      ".node polygon { stroke: var(--gd-line) !important; }" +
      p +
      ".note," +
      p +
      "rect.note," +
      p +
      ".labelBox," +
      p +
      "rect.labelBox { stroke: var(--gd-orange) !important; }" +
      p +
      ".messageText," +
      p +
      ".messageText > tspan," +
      p +
      "text.messageText," +
      p +
      ".noteText," +
      p +
      ".noteText > tspan," +
      p +
      ".loopText," +
      p +
      ".loopText > tspan," +
      p +
      ".labelText," +
      p +
      ".labelText > tspan," +
      p +
      ".sectionTitle," +
      p +
      "text.actor," +
      p +
      "text.actor > tspan," +
      p +
      ".nodeLabel," +
      p +
      ".node .label," +
      p +
      ".node span," +
      p +
      ".node foreignObject," +
      p +
      ".node foreignObject div," +
      p +
      ".node foreignObject span," +
      p +
      ".label foreignObject div { fill: var(--gd-text) !important; color: var(--gd-text) !important; stroke: none !important; }" +
      p +
      ".sequenceNumber { fill: #fafafa !important; stroke: none !important; }";
  });
}

function gdCaptureMermaidSources() {
  document.querySelectorAll("pre.mermaid, .mermaid").forEach(function (el) {
    if (el.dataset.gdSrc) return;
    var svg = el.querySelector("svg");
    if (svg) return;
    el.dataset.gdSrc = (el.textContent || "").trim();
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
  document.querySelectorAll("pre.mermaid, .mermaid").forEach(function (el) {
    if (!el.dataset.gdSrc) return;
    el.removeAttribute("data-processed");
    el.textContent = el.dataset.gdSrc;
    nodes.push(el);
  });
  if (!nodes.length) {
    gdApplyMermaidTextTheme();
    return;
  }
  await mermaid.run({ nodes: nodes });
  gdApplyMermaidTextTheme();
}

var gdWatchingScheme = false;

if (typeof mermaid !== "undefined") {
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    htmlLabels: false,
    flowchart: { htmlLabels: false, curve: "linear" },
    themeCSS: gdMermaidThemeCSS(),
  });
}

document$.subscribe(function () {
  gdRenderMermaid();
  requestAnimationFrame(function () {
    gdApplyMermaidTextTheme();
    setTimeout(gdApplyMermaidTextTheme, 250);
  });
  if (gdWatchingScheme) return;
  gdWatchingScheme = true;
  new MutationObserver(function () {
    gdRenderMermaid();
  }).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-md-color-scheme"],
  });
});
