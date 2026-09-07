let meta = #{
    name: "x-trends",
    description: "32-way X.com and web scan for what people enjoy in git/code city tools",
    when_to_use: "Need a dedicated X.com trends pass for git-city / code-city / skyline tools",
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
        "git city 3D pixel building contributions",
        "code city files as buildings folders districts",
        "git skyline contribution graph 3D",
        "gource visualization agent commits",
        "gitdiagram architecture diagram github",
        "gitropolis repository as city",
        "codebase atlas isometric map skill",
        "terminal tui git visualization",
        "shareable git city view link",
        "github profile as building city",
        "code city metaphor wettel",
        "first-parent git history visualization",
        "agent useful repo map json",
        "claude skill isometric codebase city",
        "fly through github city",
        "git city pvp arcade",
        "embed github skyline readme svg",
        "watch repository grow commit by commit",
        "code ownership visualization city",
        "three.js git repository city",
        "opentui terminal city git",
        "where do I start in a github repo",
        "find my building git city",
        "lit windows commits activity city",
        "headless git visualization snapshot json",
        "compare branches as city overlay",
        "ruins deleted files visualization",
        "import graph roads in code city",
        "churn overlay codebase map",
        "share command gitcity --view",
        "mcp git repository map for agents",
        "gource vs code city vs git skyline"
    ];

fn job(label, topic, repo) {
    let p = "READ-ONLY investigator. Do not edit the GitCity tree. ";
    p += "Repo root if needed: ";
    p += repo;
    p += ". Task: Search X and the public web for this query. Quote posts with ids or URLs. Note what people enjoy, share, or ask agents to do. This substitutes for a 24/7 scraper. ";
    p += "Query: ";
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
syn += "Task was: Search X and the public web for this query. Quote posts with ids or URLs. Note what people enjoy, share, or ask agents to do. This substitutes for a 24/7 scraper. ";
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
