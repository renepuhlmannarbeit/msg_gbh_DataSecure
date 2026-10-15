//! Closed pre-start boundary for the Standalone content contract.
//! Presence is decoded from the actual request, never from Option<T>, which
//! would collapse explicit JSON null into a missing legacy field.

use serde::{Deserialize, Serialize};
use serde_json::Value;

const INVALID: &str = "CONTENT_OPTIONS_INVALID";
const NOT_READY: &str = "CONTENT_OPTIONS_NOT_READY";
const START_FIELDS: &[&str] = &[
    "processingMode", "outputNamingMode", "ocrContactReview", "sourceIds",
    "catalogueRevision", "contentOptions",
];

#[derive(Deserialize, Serialize)]
enum Schema {
    #[serde(rename = "datasecure-content-options/1")]
    V1,
}

#[derive(Deserialize, Serialize)]
enum MarkdownOutput {
    #[serde(rename = "content-v1")]
    Content,
    #[serde(rename = "notes-v1")]
    Notes,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ContentOptions {
    schema: Schema,
    markdown_output: MarkdownOutput,
    scan_ocr: bool,
    image_ocr: bool,
}

// The native caller supplies document_review from its actual Workspace URL,
// never from a renderer field. Missing options preserve the legacy route;
// explicit null cannot silently turn the new route into a legacy request.
pub fn decode_start(body: &Value, document_review: bool) -> Result<Option<Value>, String> {
    let fields = body.as_object().ok_or(INVALID)?;
    if fields.keys().any(|key| !START_FIELDS.contains(&key.as_str())) {
        return Err(INVALID.into());
    }
    match fields.get("contentOptions") {
        None => Ok(None),
        Some(value) => {
            let content: ContentOptions = serde_json::from_value(value.clone()).map_err(|_| INVALID)?;
            match fields.get("processingMode").and_then(Value::as_str) {
                Some("markdown-only" | "markdown-and-anonymize") if document_review =>
                    serde_json::to_value(content).map(Some).map_err(|_| INVALID.into()),
                Some("markdown-only" | "markdown-and-anonymize") => Err(NOT_READY.into()),
                _ => Err("PROCESSING_MODE_INVALID".into()),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn contract() -> Value {
        json!({ "schema": "datasecure-content-options/1", "markdownOutput": "content-v1",
            "scanOcr": true, "imageOcr": false })
    }

    #[test]
    fn missing_contract_preserves_both_real_legacy_start_shapes() {
        assert_eq!(decode_start(&json!({ "processingMode": "markdown-only",
            "ocrContactReview": true, "sourceIds": ["a"], "catalogueRevision": 7 }), false).unwrap(), None);
        assert_eq!(decode_start(&json!({ "processingMode": "markdown-and-anonymize",
            "outputNamingMode": "neutral" }), true).unwrap(), None);
    }

    #[test]
    fn every_valid_raw_option_is_decoded_without_defaults_or_coercion() {
        for output in ["content-v1", "notes-v1"] {
            for scan in [false, true] {
                for image in [false, true] {
                    let mut content = contract();
                    content["markdownOutput"] = json!(output);
                    content["scanOcr"] = json!(scan);
                    content["imageOcr"] = json!(image);
                    assert_eq!(decode_start(&json!({ "processingMode": "markdown-only",
                        "contentOptions": content }), true).unwrap(), Some(content));
                }
            }
        }
    }

    #[test]
    fn both_content_purposes_require_the_trusted_document_surface() {
        let content = contract();
        for mode in ["markdown-only", "markdown-and-anonymize"] {
            assert_eq!(decode_start(&json!({ "processingMode": mode,
                "contentOptions": content }), true).unwrap(), Some(content.clone()));
            assert_eq!(decode_start(&json!({ "processingMode": mode,
                "contentOptions": content }), false).unwrap_err(), NOT_READY);
        }
        for mode in [Value::Null, json!(true), json!("raw"), json!("")] {
            assert_eq!(decode_start(&json!({ "processingMode": mode,
                "contentOptions": content }), true).unwrap_err(), "PROCESSING_MODE_INVALID");
        }
        assert_eq!(decode_start(&json!({ "contentOptions": content }), true).unwrap_err(), "PROCESSING_MODE_INVALID");
        assert_eq!(decode_start(&json!({ "processingMode": "markdown-only", "contentOptions": content,
            "documentReview": true }), false).unwrap_err(), INVALID);
    }

    #[test]
    fn explicit_null_partial_or_wrong_types_cannot_become_legacy() {
        for value in [Value::Null, json!({}), json!(true), json!([]), json!("options")] {
            assert_eq!(decode_start(&json!({ "processingMode": "markdown-only", "contentOptions": value }), true).unwrap_err(), INVALID);
        }
        for field in ["schema", "markdownOutput", "scanOcr", "imageOcr"] {
            let mut missing = contract(); missing.as_object_mut().unwrap().remove(field);
            assert_eq!(decode_start(&json!({ "processingMode": "markdown-only", "contentOptions": missing }), true).unwrap_err(), INVALID);
            for value in [Value::Null, json!(1), json!("true")] {
                let mut wrong = contract(); wrong[field] = value;
                assert_eq!(decode_start(&json!({ "processingMode": "markdown-only", "contentOptions": wrong }), true).unwrap_err(), INVALID);
            }
        }
    }

    #[test]
    fn aliases_unknown_versions_and_extra_fields_are_closed() {
        for field in ["content_options", "scanOcr", "imageOcr", "markdownOutput", "extra"] {
            let mut body = json!({ "processingMode": "markdown-only" }); body[field] = contract();
            assert_eq!(decode_start(&body, true).unwrap_err(), INVALID);
        }
        for (field, value) in [("schema", json!("datasecure-content-options/2")),
            ("markdownOutput", json!("automatic")), ("image_ocr", json!(true)), ("extra", json!(false))] {
            let mut content = contract(); content[field] = value;
            assert_eq!(decode_start(&json!({ "processingMode": "markdown-only", "contentOptions": content }), true).unwrap_err(), INVALID);
        }
    }

    #[test]
    fn non_object_request_bodies_are_never_legacy() {
        for body in [Value::Null, json!([]), json!(0), json!("raw")] {
            assert_eq!(decode_start(&body, true).unwrap_err(), INVALID);
        }
    }
}
