fn main() {
    // Tauri embeds this sibling directory in the executable. Cargo's
    // default package scan does not cover it, so frontend-only edits must
    // explicitly invalidate the native binary on every target.
    println!("cargo:rerun-if-changed=../frontend");
    tauri_build::build()
}
