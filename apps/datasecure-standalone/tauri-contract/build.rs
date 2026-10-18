fn main() {
    // --manifest-path does not make Cargo load the crate's .cargo/config.toml.
    // A Windows build from the wrong working directory must fail before it can
    // silently reintroduce an undeclared machine-wide Visual C++ dependency.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let features = std::env::var("CARGO_CFG_TARGET_FEATURE").unwrap_or_default();
        assert!(features.split(',').any(|feature| feature == "crt-static"),
            "WINDOWS_NATIVE_STATIC_CRT_REQUIRED: build from the crate directory or pass its --config explicitly");
    }
    // Tauri embeds this sibling directory in the executable. Cargo's
    // default package scan does not cover it, so frontend-only edits must
    // explicitly invalidate the native binary on every target.
    println!("cargo:rerun-if-changed=../frontend");
    println!("cargo:rerun-if-changed=Info.plist");
    println!("cargo:rerun-if-env-changed=DATASECURE_BUILD_ID");
    let manifest = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").expect("Cargo manifest directory"));
    let repository = manifest.ancestors().nth(3).expect("Standalone repository root");
    let mut command = std::process::Command::new("node");
    command.arg(repository.join("scripts/lib/standalone-build-fingerprint.mjs"))
        .arg("--cargo").arg(repository);
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command.output().expect("Standalone source fingerprint requires Node.js on the build host");
    assert!(output.status.success(), "Standalone source fingerprint failed: {}", String::from_utf8_lossy(&output.stderr));
    print!("{}", String::from_utf8(output.stdout).expect("UTF-8 fingerprint directives"));
    // The native ownership module is target-local. Embed its independently
    // verified digest rather than trusting an editable runtime-side checksum.
    let mut ownership = std::process::Command::new("node");
    let verifier = if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        "scripts/lib/macos-core-artifact.mjs"
    } else { "scripts/lib/ownership-guard-artifact.mjs" };
    ownership.arg(repository.join(verifier))
        .arg("--cargo").arg(repository).arg(std::env::var("TARGET").expect("Cargo target"));
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        ownership.creation_flags(0x08000000);
    }
    let verified = ownership.output().expect("Native ownership artifact verifier requires build-host Node.js");
    assert!(verified.status.success(), "Native ownership artifact verification failed: {}", String::from_utf8_lossy(&verified.stderr));
    print!("{}", String::from_utf8(verified.stdout).expect("UTF-8 ownership directives"));
    tauri_build::build()
}
