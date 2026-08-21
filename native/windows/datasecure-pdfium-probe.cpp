#define WIN32_LEAN_AND_MEAN
#include <fcntl.h>
#include <io.h>

#include <cstdint>
#include <iostream>
#include <iterator>
#include <limits>
#include <string>
#include <vector>

#include "fpdf_annot.h"
#include "fpdf_attachment.h"
#include "fpdf_edit.h"
#include "fpdf_javascript.h"
#include "fpdf_text.h"
#include "fpdfview.h"

namespace {
constexpr size_t kMaxInputBytes = 32u * 1024u * 1024u;
constexpr int kMaxPages = 200;
constexpr int kMaxObjects = 100000;
constexpr int kMaxCharacters = 10000000;

struct Counts {
  int pages = 0;
  int text_objects = 0;
  int nontext_objects = 0;
  int annotations = 0;
  int attachments = 0;
  int javascript_actions = 0;
  int unicode_characters = 0;
  int unmapped_characters = 0;
};

int Stop(const char* code, const Counts& counts = {}) {
  std::cout << "{\"schema_version\":1,\"engine\":\"pdfium-153.0.8009.0\","
            << "\"status\":\"stopped\",\"code\":\"" << code << "\","
            << "\"pages\":" << counts.pages << ",\"text_objects\":"
            << counts.text_objects << ",\"nontext_objects\":"
            << counts.nontext_objects << ",\"annotations\":" << counts.annotations
            << ",\"attachments\":" << counts.attachments
            << ",\"javascript_actions\":" << counts.javascript_actions
            << ",\"unicode_characters\":" << counts.unicode_characters
            << ",\"unmapped_characters\":" << counts.unmapped_characters << "}\n";
  return 2;
}

int Accept(const Counts& counts) {
  std::cout << "{\"schema_version\":1,\"engine\":\"pdfium-153.0.8009.0\","
            << "\"status\":\"text_only_candidate\",\"code\":\"NONE\","
            << "\"pages\":" << counts.pages << ",\"text_objects\":"
            << counts.text_objects << ",\"nontext_objects\":0,\"annotations\":0,"
            << "\"attachments\":0,\"javascript_actions\":0,"
            << "\"unicode_characters\":" << counts.unicode_characters
            << ",\"unmapped_characters\":0}\n";
  return 0;
}
}  // namespace

int main() {
  if (_setmode(_fileno(stdin), _O_BINARY) == -1) return Stop("PROBE_STDIN_BINARY");
  std::vector<uint8_t> bytes;
  bytes.reserve(64u * 1024u);
  char chunk[8192];
  while (std::cin.good()) {
    std::cin.read(chunk, sizeof(chunk));
    const auto read = std::cin.gcount();
    if (read > 0) {
      if (bytes.size() + static_cast<size_t>(read) > kMaxInputBytes) {
        return Stop("PROBE_INPUT_LIMIT");
      }
      bytes.insert(bytes.end(), chunk, chunk + read);
    }
  }
  if (bytes.empty()) return Stop("PROBE_EMPTY_INPUT");

  FPDF_LIBRARY_CONFIG config{};
  config.version = 2;
  FPDF_InitLibraryWithConfig(&config);
  FPDF_DOCUMENT document = FPDF_LoadMemDocument64(bytes.data(), bytes.size(), nullptr);
  if (!document) {
    const auto error = FPDF_GetLastError();
    FPDF_DestroyLibrary();
    return Stop(error == FPDF_ERR_PASSWORD ? "PROBE_ENCRYPTED" : "PROBE_PARSE_FAILED");
  }

  Counts counts;
  if (FPDF_GetSecurityHandlerRevision(document) >= 0) {
    FPDF_CloseDocument(document);
    FPDF_DestroyLibrary();
    return Stop("PROBE_ENCRYPTED");
  }
  counts.attachments = FPDFDoc_GetAttachmentCount(document);
  counts.javascript_actions = FPDFDoc_GetJavaScriptActionCount(document);
  if (counts.attachments < 0 || counts.attachments > kMaxObjects ||
      counts.javascript_actions < 0 || counts.javascript_actions > kMaxObjects) {
    FPDF_CloseDocument(document);
    FPDF_DestroyLibrary();
    return Stop("PROBE_CATALOG_FAILED", counts);
  }

  counts.pages = FPDF_GetPageCount(document);
  if (counts.pages <= 0 || counts.pages > kMaxPages) {
    FPDF_CloseDocument(document);
    FPDF_DestroyLibrary();
    return Stop("PROBE_PAGE_LIMIT", counts);
  }

  const char* failure = nullptr;
  for (int page_index = 0; page_index < counts.pages && !failure; ++page_index) {
    FPDF_PAGE page = FPDF_LoadPage(document, page_index);
    if (!page) {
      failure = "PROBE_PAGE_LOAD_FAILED";
      break;
    }
    const int annotations = FPDFPage_GetAnnotCount(page);
    if (annotations < 0) {
      failure = "PROBE_ANNOTATION_SCAN_FAILED";
      FPDF_ClosePage(page);
      break;
    }
    if (annotations > kMaxObjects - counts.annotations) {
      failure = "PROBE_ANNOTATION_LIMIT";
      FPDF_ClosePage(page);
      break;
    }
    counts.annotations += annotations;

    const int objects = FPDFPage_CountObjects(page);
    if (objects < 0 || objects > kMaxObjects - counts.text_objects - counts.nontext_objects) {
      failure = "PROBE_OBJECT_LIMIT";
      FPDF_ClosePage(page);
      break;
    }
    for (int object_index = 0; object_index < objects; ++object_index) {
      FPDF_PAGEOBJECT object = FPDFPage_GetObject(page, object_index);
      if (!object || FPDFPageObj_GetType(object) != FPDF_PAGEOBJ_TEXT) {
        ++counts.nontext_objects;
      } else {
        ++counts.text_objects;
      }
    }

    FPDF_TEXTPAGE text_page = FPDFText_LoadPage(page);
    if (!text_page) {
      failure = "PROBE_TEXT_LOAD_FAILED";
      FPDF_ClosePage(page);
      break;
    }
    const int characters = FPDFText_CountChars(text_page);
    const int total_characters = counts.unicode_characters + counts.unmapped_characters;
    if (characters < 0 || characters > kMaxCharacters - total_characters) {
      failure = "PROBE_CHARACTER_LIMIT";
    } else {
      for (int character_index = 0; character_index < characters; ++character_index) {
        const unsigned int unicode = FPDFText_GetUnicode(text_page, character_index);
        if (unicode == 0 || unicode == 0xfffd || unicode > 0x10ffff ||
            (unicode >= 0xd800 && unicode <= 0xdfff)) {
          ++counts.unmapped_characters;
        } else {
          ++counts.unicode_characters;
        }
      }
    }
    FPDFText_ClosePage(text_page);
    FPDF_ClosePage(page);
  }

  FPDF_CloseDocument(document);
  FPDF_DestroyLibrary();
  if (failure) return Stop(failure, counts);
  if (counts.attachments != 0) return Stop("PROBE_ATTACHMENTS_PRESENT", counts);
  if (counts.javascript_actions != 0) return Stop("PROBE_JAVASCRIPT_PRESENT", counts);
  if (counts.annotations != 0) return Stop("PROBE_ANNOTATIONS_PRESENT", counts);
  if (counts.nontext_objects != 0) return Stop("PROBE_NONTEXT_PRESENT", counts);
  if (counts.unmapped_characters != 0) return Stop("PROBE_UNICODE_UNMAPPED", counts);
  if (counts.text_objects == 0 || counts.unicode_characters == 0) {
    return Stop("PROBE_NO_TEXT", counts);
  }
  return Accept(counts);
}
