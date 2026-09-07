let meta = #{
    name: "improve-city-experience",
    description: "Scan GitCity streets, architecture, history, and defining-job invariants across 32 files",
    when_to_use: "Need a 32-agent pass on city layout, history playback, and defining-job regressions",
    phases: [
        #{ title: "Scan", detail: "32 read-only inspectors, one topic each" },
        #{ title: "Synthesize", detail: "one report from surviving findings" },
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
        "src/world.ts",
        "src/controller.ts",
        "src/landscape.ts",
        "src/scene.ts",
        "src/ambient.ts",
        "src/geography.ts",
        "src/atlas.ts",
        "src/city.ts",
        "src/cli.ts",
        "src/app.ts",
        "src/repository.ts",
        "src/urban.ts",
        "src/architecture.ts",
        "src/insights.ts",
        "src/dependencies.ts",
        "src/ruins.ts",
        "src/world-style.ts",
        "src/types.ts",
        "tests/zoom.test.ts",
        "tests/cli.test.ts",
        "tests/ui.test.ts",
        "tests/controller.test.ts",
        "tests/atlas.test.ts",
        "tests/city.test.ts",
        "tests/world-style.test.ts",
        "tests/urban.test.ts",
        "tests/architecture.test.ts",
        "IMPLEMENTATION.md",
        "README.md",
        "VALIDATION.md",
        "bin/gitcity.mjs",
        "scripts/create-demo.ts"
    ];

fn job(label, topic, repo) {
    let p = "READ-ONLY GitCity inspector. Do not edit, commit, or push. ";
    p += "Repo root is ";
    p += repo;
    p += ". Task: Check files-as-houses, folders-as-settlements, first-parent history, owner/repo GitHub loading, and street/architecture/ambient regressions. Do not propose leaving the terminal. ";
    p += "Assigned path or doc: ";
    p += topic;
    p += ". Use read_file and grep on the real files before answering. ";
    p += "If the path is missing, say so. Return concrete findings with file paths. ";
    p += "An empty finding list is valid only after you read the assigned file.";
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
let syn = "Synthesize the GitCity scan notes below into a short improvement report. ";
syn += "Repo root: ";
syn += root;
syn += ". Task was: Check files-as-houses, folders-as-settlements, first-parent history, owner/repo GitHub loading, and street/architecture/ambient regressions. Do not propose leaving the terminal. ";
syn += "Use the notes. Do not invent files. ";
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
    body = "No usable scan notes.";
}
let path = write_scratch_file("report.md", body);
complete(#{ path: path, notes: notes.len(), report: body });
