//! Closed relative Results inventory, not a general path/file API.
use super::*;
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap, HashSet};

pub(crate) const MAX_DIRECTORIES: usize = 200 * 32;
pub(crate) const MAX_RECORD_BYTES: usize = 768 * 1024;
pub(crate) const MAX_RECORD_ENTRIES: usize = 2 * MAX_DIRECTORIES + 64;
#[cfg(test)]
std::thread_local! { static AFTER_TREE: std::cell::RefCell<Option<Box<dyn FnOnce()>>> = const { std::cell::RefCell::new(None) }; }
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) enum Layout { #[serde(rename = "initial-relative/1")] InitialRelative }
pub(crate) fn deserialize_layout<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Option<Layout>, D::Error> {
    Layout::deserialize(deserializer).map(Some)
}
fn key(name: &str) -> String { icu_normalizer::ComposingNormalizer::new_nfc().normalize(name).to_lowercase() }
fn segment(name: &str) -> io::Result<()> {
    // Preserve the exact spelling; normalization is only for collision keys.
    leaf(name)?;
    if key(name) == ".ds_store" { return Err(unsafe_io()); }
    let stem = name.split('.').next().unwrap_or("").to_uppercase();
    let device = ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str()) || ["COM", "LPT"].iter().any(|prefix|
        stem.strip_prefix(prefix).is_some_and(|suffix| matches!(suffix, "1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"¹"|"²"|"³")));
    if device || name.chars().any(|c| matches!(c, '<'|'>'|'"'|'|'|'?'|'*'|'\u{200b}'..='\u{200f}'|
        '\u{202a}'..='\u{202e}'|'\u{2060}'..='\u{206f}'|'\u{feff}')) { return Err(unsafe_io()); }
    Ok(())
}
#[derive(Debug)]
pub(crate) struct Node { pub path: String, pub name: String, pub parent: usize, children: Vec<usize>, files: Vec<usize> }
#[derive(Debug)]
pub(crate) struct Tree { pub nodes: Vec<Node>, pub file_parents: Vec<usize>, pub leaves: Vec<String> }
impl Tree {
    pub fn new(files: &[ExpectedFile], confidential: bool) -> io::Result<Self> {
        if files.is_empty() || files.len() > 200 { return Err(unsafe_io()); }
        let mut directories = BTreeMap::new();
        let mut file_keys = HashSet::new();
        for file in files {
            let parts: Vec<_> = file.name.split('/').collect();
            // Initial paths allow1024 UTF16 units. Reserve32 additional units
            // solely as a bounded envelope for the established confidential-
            // root reservation; JS still proves all names against its initial
            // binding and records each such deviation, never arbitrary names.
            if file.name.encode_utf16().count() > 1056 || parts.len() > 512 ||
                !file.name.ends_with(".md") || parts.last().is_none_or(|leaf| leaf.len() <= 3) ||
                confidential && key(parts[0]) == key(CONFIDENTIAL_DIRECTORY) { return Err(unsafe_io()); }
            for part in &parts { segment(part)?; }
            if !file_keys.insert(key(&file.name)) { return Err(unsafe_io()); }
            for length in 1..parts.len() {
                let path = parts[..length].join("/");
                if directories.insert(key(&path), path.clone()).is_some_and(|prior| prior != path) { return Err(unsafe_io()); }
                if directories.len() > MAX_DIRECTORIES { return Err(unsafe_io()); }
            }
        }
        if directories.keys().any(|path| file_keys.contains(path)) { return Err(unsafe_io()); }
        let mut paths: Vec<_> = directories.into_values().collect();
        paths.sort_by(|a, b| a.split('/').count().cmp(&b.split('/').count()).then_with(|| a.cmp(b)));
        let mut nodes = vec![Node { path: String::new(), name: String::new(), parent: 0, children: vec![], files: vec![] }];
        let mut indexes = HashMap::from([(String::new(), 0)]);
        for path in paths {
            let (parent_path, name) = path.rsplit_once('/').unwrap_or(("", &path));
            let parent = *indexes.get(parent_path).ok_or_else(unsafe_io)?;
            let index = nodes.len();
            nodes.push(Node { path: path.clone(), name: name.into(), parent, children: vec![], files: vec![] });
            nodes[parent].children.push(index); indexes.insert(path, index);
        }
        let mut file_parents = vec![]; let mut leaves = vec![];
        for (index, file) in files.iter().enumerate() {
            let (parent, leaf) = file.name.rsplit_once('/').unwrap_or(("", &file.name));
            let parent = *indexes.get(parent).ok_or_else(unsafe_io)?;
            nodes[parent].files.push(index); file_parents.push(parent); leaves.push(leaf.into());
        }
        Ok(Self { nodes, file_parents, leaves })
    }
    pub fn ancestors(&self, index: usize) -> Vec<usize> {
        let mut chain = vec![]; let mut next = index;
        while next != 0 { chain.push(next); next = self.nodes[next].parent; }
        chain.reverse(); chain
    }
    pub fn verify(&self, root: &Directory, identities: &[Identity], files: &[ExpectedFile],
        confidential: Option<(&ConfidentialFiles, Identity)>, public: bool) -> io::Result<()> {
        if identities.len() != self.nodes.len() || identities[0] != root.identity() { return Err(unsafe_io()); }
        let public = public && cfg!(target_os = "macos");
        // An explicit traversal stack also handles historical deep paths
        // without consuming one native call frame per directory.
        struct Frame { index: usize, next: usize, directory: Option<Directory>, names: Vec<String>, metadata: u64 }
        let mut stack = vec![];
        let mut metadata_total = 0u64;
        let mut root_metadata = 0u64;
        let enter = |directory: &Directory, index: usize| -> io::Result<(Vec<String>, u64)> {
            if !public { directory.verify_controlled()?; }
            let node = &self.nodes[index];
            let mut names: Vec<_> = node.children.iter().map(|child| self.nodes[*child].name.clone())
                .chain(node.files.iter().map(|file| self.leaves[*file].clone())).collect();
            if index == 0 && confidential.is_some() { names.push(CONFIDENTIAL_DIRECTORY.into()); }
            names.sort();
            let metadata = directory.verify_public_results_names_size(&names, public)?;
            for file in &node.files {
                directory.verify_expected_file(&ExpectedFile { name: self.leaves[*file].clone(), ..files[*file].clone() })?;
            }
            Ok((names, metadata))
        };
        let (names, metadata) = enter(root, 0)?;
        let root_names = names.clone();
        stack.push(Frame { index: 0, next: 0, directory: None, names, metadata });
        let verify_confidential = || -> io::Result<u64> { if let Some((value, identity)) = confidential {
            let child = root.open_known_child(CONFIDENTIAL_DIRECTORY, identity)?;
            if !public { child.directory.verify_controlled()?; }
            let expected = value.files();
            let mut names: Vec<_> = expected.iter().map(|file| file.name.clone()).collect(); names.sort();
            let before = child.directory.verify_public_results_names_size(&names, public)?;
            for file in &expected { child.directory.verify_expected_file(file)?; }
            let observed = before.max(child.directory.verify_public_results_names_size(&names, public)?);
            root.inspect_child(CONFIDENTIAL_DIRECTORY, identity)?;
            Ok(observed)
        } else { Ok(0) } };
        let confidential_metadata = verify_confidential()?;
        while let Some(frame) = stack.last_mut() {
            let directory = frame.directory.as_ref().unwrap_or(root);
            if let Some(index) = self.nodes[frame.index].children.get(frame.next).copied() {
                frame.next += 1;
                let node = &self.nodes[index];
                directory.inspect_child(&node.name, identities[index])?;
                let inner = platform::open_recovery_child(&directory.inner, &node.name)?;
                if platform::directory_identity(&inner)? != identities[index] { return Err(unsafe_io()); }
                let child = Directory { inner, identity: identities[index] };
                let (names, metadata) = enter(&child, index)?;
                stack.push(Frame { index, next: 0, directory: Some(child), names, metadata });
            } else {
                let observed = frame.metadata.max(directory.verify_public_results_names_size(&frame.names, public)?);
                if frame.index == 0 { root_metadata = observed; }
                metadata_total = metadata_total.checked_add(observed).ok_or_else(unsafe_io)?;
                if metadata_total > 8 * 1024 * 1024 { return Err(unsafe_io()); }
                directory.check()?;
                let index = frame.index;
                // Retain the owned child through the parent's final name check.
                let finished = stack.pop().ok_or_else(unsafe_io)?;
                if let Some(parent) = stack.last() {
                    parent.directory.as_ref().unwrap_or(root).inspect_child(&self.nodes[index].name, identities[index])?;
                }
                drop(finished);
            }
        }
        #[cfg(test)] AFTER_TREE.with(|slot| { if let Some(hook) = slot.borrow_mut().take() { hook(); } });
        // Preserve the old pre/post companion verification around all document
        // reads, including a long subtree traversal. Metadata is charged by the
        // maximum observation per directory, never twice for the same pass.
        let confidential_metadata = confidential_metadata.max(verify_confidential()?);
        let final_root_metadata = root_metadata.max(root.verify_public_results_names_size(&root_names, public)?);
        metadata_total = metadata_total.checked_sub(root_metadata).and_then(|total| total.checked_add(final_root_metadata))
            .and_then(|total| total.checked_add(confidential_metadata)).ok_or_else(unsafe_io)?;
        if metadata_total > 8 * 1024 * 1024 { return Err(unsafe_io()); }
        root.check()
    }
}
impl RecoveredDirectory<'_> {
    pub fn verify_relative_results(&self, tree: &Tree, identities: &[Identity], files: &[ExpectedFile],
        confidential: Option<(&ConfidentialFiles, Identity)>, public: bool) -> io::Result<()> {
        self.parent.inspect_child(&self.name, self.directory.identity)?;
        tree.verify(&self.directory, identities, files, confidential, public)?;
        self.parent.inspect_child(&self.name, self.directory.identity)?; Ok(())
    }
}
pub(crate) fn validate_inventory(mode: &str, results: bool, files: &[ExpectedFile],
    confidential: Option<&ConfidentialFiles>, layout: Option<Layout>) -> io::Result<()> {
    if layout.is_none() { return validate_publication_inventory(mode, results, files, confidential); }
    if !results || !["markdown-only", "markdown-and-anonymize"].contains(&mode) ||
        confidential.is_some() != (mode == "markdown-and-anonymize") { return Err(unsafe_io()); }
    Tree::new(files, confidential.is_some())?;
    let mut total = confidential.map(ConfidentialFiles::total_bytes).transpose()?.unwrap_or(0);
    for file in files {
        if file.bytes > 32_000_000 { return Err(unsafe_io()); }
        total = total.checked_add(file.bytes).ok_or_else(unsafe_io)?;
        if total > 500 * 1024 * 1024 { return Err(unsafe_io()); }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn files(names: &[&str]) -> Vec<ExpectedFile> {
        names.iter().map(|name| ExpectedFile { name: (*name).into(), bytes: 1, sha256: [0; 32] }).collect()
    }
    #[test]
    fn names_preserve_exact_relative_spelling_and_have_js_parity() {
        let tree = Tree::new(&files(&["A/B/Bericht.md", "C/Bericht.md"]), false).unwrap();
        assert_eq!(tree.nodes.iter().map(|node| node.path.as_str()).collect::<Vec<_>>(), ["", "A", "C", "A/B"]);
        assert_eq!(tree.file_parents, [3, 2]); assert_eq!(tree.leaves, ["Bericht.md", "Bericht.md"]);
        assert!(Tree::new(&files(&["Äpfel/Gru\u{0308}ße.md", "Vertraulich/Kontext.md"]), false).is_ok());
        assert!(Tree::new(&files(&["Vertraulich/Kontext.md"]), true).is_err());
        assert!(Tree::new(&files(&["Vertraulich (Quelle 2)/Kontext.md"]), true).is_ok());
        for name in ["/A.md", "../A.md", "A/../B.md", "./A.md", "A//B.md", "C:/A.md", "A\\B.md", "A/NUL/B.md",
            "A/COM¹/B.md", "A/.DS_Store/B.md", "A/Ende./B.md", "A/Ende /B.md", "A/\u{202e}B.md"] {
            assert!(Tree::new(&files(&[name]), false).is_err(), "{name}");
        }
        for names in [["Ä.md", "A\u{0308}.md"], ["A/B.md", "a/C.md"], ["A.md", "A.md/B.md"]] {
            assert!(Tree::new(&files(&names), false).is_err(), "{names:?}");
        }
        assert!(Tree::new(&files(&[&format!("A/{}.md", "中".repeat(86))]), false).is_err());
        for depth in [33, 100, 510] {
            let name = format!("{}x.md", "a/".repeat(depth));
            let graph = Tree::new(&files(&[&name]), false).unwrap();
            assert_eq!(graph.nodes.len(), depth + 1);
        }
        assert!(Tree::new(&files(&[&format!("{}x.md", "a/".repeat(512))]), false).is_err());
        assert!(Tree::new(&[], false).is_err());
        let too_many: Vec<_> = (0..201).map(|n| ExpectedFile { name: format!("{n}.md"), bytes: 1, sha256: [0; 32] }).collect();
        assert!(Tree::new(&too_many, false).is_err());
    }
    #[test]
    fn relative_layout_is_closed_and_does_not_weaken_legacy_names_or_size_guards() {
        let relative = Some(Layout::InitialRelative);
        let documents = files(&["A/B.md", "C/B.md"]);
        assert!(validate_inventory("markdown-only", true, &documents, None, relative).is_ok());
        assert!(validate_inventory("markdown-only", false, &documents, None, relative).is_err());
        assert!(validate_inventory("markdown-only", true, &documents, None, None).is_err());
        assert!(validate_inventory("markdown-and-anonymize", true, &documents, None, relative).is_err());
        let mut oversize = documents.clone(); oversize[0].bytes = 32_000_001;
        assert!(validate_inventory("markdown-only", true, &oversize, None, relative).is_err());
        let mut total: Vec<_> = (0..17).map(|n| ExpectedFile { name: format!("{n}/A.md"), bytes: 32_000_000, sha256: [0; 32] }).collect();
        assert!(validate_inventory("markdown-only", true, &total, None, relative).is_err());
        total.pop(); assert!(validate_inventory("markdown-only", true, &total, None, relative).is_ok());
    }
    #[test]
    fn confidential_bodies_are_rechecked_after_the_entire_tree_traversal() {
        let path = std::env::temp_dir().join(format!("datasecure-relative-companion-{}-{}", std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir(&path).unwrap();
        {
            let parent = Directory::open_existing(&path, None).unwrap();
            let root = parent.create_controlled_child("stage").unwrap();
            let a = root.create_controlled_child("A").unwrap(); let b = a.create_controlled_child("B").unwrap();
            b.write_new("x.md", b"text").unwrap();
            let private = root.create_controlled_child(CONFIDENTIAL_DIRECTORY).unwrap();
            private.write_new(FILENAME_MAPPING, b"mapping").unwrap(); private.write_new(IDENTITIES_FILE, b"identities").unwrap();
            let confidential = ConfidentialFiles { filename_mapping: ConfidentialFile { bytes: 7, sha256: Sha256::digest(b"mapping").into() },
                identities: ConfidentialFile { bytes: 10, sha256: Sha256::digest(b"identities").into() }, workbook: None };
            let documents = vec![ExpectedFile { name: "A/B/x.md".into(), bytes: 4, sha256: Sha256::digest(b"text").into() }];
            let tree = Tree::new(&documents, true).unwrap();
            let ids = [root.identity(), a.identity(), b.identity()]; let private_id = private.identity();
            drop(private); drop(b); drop(a);
            tree.verify(&root, &ids, &documents, Some((&confidential, private_id)), false).unwrap();
            let file = path.join("stage/Vertraulich").join(IDENTITIES_FILE);
            let changed = file.clone();
            AFTER_TREE.with(|slot| *slot.borrow_mut() = Some(Box::new(move || std::fs::write(&changed, b"changed").unwrap())));
            assert!(tree.verify(&root, &ids, &documents, Some((&confidential, private_id)), false).is_err(),
                "a companion changed after its first hash must be refused in the same inventory pass");
            assert_eq!(std::fs::read(&file).unwrap(), b"changed", "the intended post-traversal hook actually ran");
        }
        assert_eq!(path.parent().unwrap(), std::env::temp_dir());
        assert!(path.file_name().unwrap().to_str().unwrap().starts_with("datasecure-relative-companion-"));
        std::fs::remove_dir_all(path).unwrap();
    }
}
