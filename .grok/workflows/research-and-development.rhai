let meta = #{
    name: "research-and-development",
    description: "32-way R&D canvas of GitCity spin-offs, agent uses, and similar tools",
    when_to_use: "Need a research-and-development pass separate from the five coding workflows",
    phases: [
        #{ title: "Scan", detail: "32 read-only investigators" },
        #{ title: "Synthesize", detail: "one cited report" },
    ],
};

fn trimmed(s) {
    if type_of(s) == "string" {
        s.trim();
        s
    } else {
        ""
    }
}

let root = ".";
if args != () && args.root != () {
    root = args.root;
}

let topics = [
        "agent JSON schema for a code city",
        "MCP wrapper around gitcity --json",
        "README SVG badge from --snapshot",
        "brief-me tour JSON for new clones",
        "PR blast-radius as changed buildings",
        "stable coordinates across zoom levels",
        "text screenshot of OpenTUI frames",
        "short replay artifact of history frames",
        "pasteable share command with --view",
        "overview cell identity preservation",
        "20k file draw cap lessons from maximalcode",
        "Gource headless PPM vs our --json",
        "codebase-atlas skill overlap",
        "gitropolis logarithmic height",
        "GoCity metrics encoding",
        "Wettel CodeCity polymetric views",
        "skyline-run share URL previews",
        "gh-skyline ASCII terminal preview",
        "first-parent vs full graph playback",
        "tokenless owner/repo clone UX",
        "help overlay overflow at 100x35",
        "minimap in one world coordinate system",
        "legend readability for churn overlays",
        "inspector density vs glanceability",
        "ruins as agent-visible deletions",
        "import routes as structured edges in JSON",
        "guided tours as agent briefing stops",
        "compare slider as JSON before/after",
        "spin-off MCP vs staying CLI-only",
        "what not to copy from thegitcity.com",
        "what not to copy from maximalcode git-city",
        "verification of headless output on a fixture"
    ];

fn job(label, topic, repo) {
    let p = "READ-ONLY investigator. Do not edit the GitCity tree. ";
    p += "Repo root if needed: ";
    p += repo;
    p += ". Task: Research this R&D topic against GitCity and similar tools. Cite URLs. Say what to build here versus a spin-off. ";
    p += "Topic: ";
    p += topic;
    p += ". Use tools (read_file, grep, web_search, web_fetch) before answering. ";
    p += "Cite URLs or post ids. Invented lists fail. Empty is valid only after a real lookup.";
    #{ prompt: p, label: label, capability_mode: "read-only" }
}

phase("Scan");
let jobs = [];
let i = 0;
for t in topics {
    jobs.push(job("scan-" + i.to_string(), t, root));
    i += 1;
}
log("scan panel size " + jobs.len().to_string());
let results = parallel(jobs);

let notes = [];
for r in results {
    if r != () && r.success && r.output != () {
        let text = trimmed(r.output);
        if text == "" && type_of(r.output) != "string" {
            text = json_encode(r.output);
        }
        if text != "" {
            notes.push(text);
        }
    }
}
log("scan notes " + notes.len().to_string());

phase("Synthesize");
let syn = "Write a cited report from the notes. Drop unsourced claims. ";
syn += "Task was: Research this R&D topic against GitCity and similar tools. Cite URLs. Say what to build here versus a spin-off. ";
syn += "<notes-json>\n";
syn += json_encode(notes);
syn += "\n</notes-json>";
let report = agent(syn, #{ label: "synthesize", capability_mode: "read-only" });
let body = "";
if report != () && report.success && report.output != () {
    body = trimmed(report.output);
    if body == "" {
        body = json_encode(report.output);
    }
}
if body == "" {
    body = "No usable notes.";
}
let path = write_scratch_file("report.md", body);
complete(#{ path: path, notes: notes.len(), report: body });
