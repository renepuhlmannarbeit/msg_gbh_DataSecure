fn main() {
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
    tauri_build::build()
}
