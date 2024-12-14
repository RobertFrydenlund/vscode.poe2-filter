import * as vscode from "vscode";

// TODO: detect definitions later that is being overriden earlier? e.g. doing something explicit later in the file, but a previous rule catches it instead
// TODO: empty show or hide blocks should trigger an error

// TODO: can we get this from the grammar?
// Define valid commands and their parameter requirements
const VALID_COMMANDS = {
  Show: { params: [] },
  Hide: { params: [] },
  SetTextColor: { params: [{ type: "color", required: true }] },
  SetBorderColor: { params: [{ type: "color", required: true }] },
  SetBackgroundColor: { params: [{ type: "color", required: true }] },
  SetFontSize: { params: [{ type: "number", required: true }] },
  // Add more commands as needed
} as const;

// Common misspellings or incorrect casing
const COMMON_MISTAKES = {
  settext: "SetTextColor",
  setborder: "SetBorderColor",
  setbackground: "SetBackgroundColor",
  setcolour: "SetColor",
  settextcolour: "SetTextColor",
  setbordercolour: "SetBorderColor",
  setbackgroundcolour: "SetBackgroundColor",
} as const;

export function registerDiagnostics(context: vscode.ExtensionContext) {
  const diagnostics =
    vscode.languages.createDiagnosticCollection("poe2-filter");
  context.subscriptions.push(diagnostics);

  // Validate on open
  if (vscode.window.activeTextEditor) {
    validateAndUpdateDiagnostics(
      vscode.window.activeTextEditor.document,
      diagnostics
    );
  }

  // Validate on editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        validateAndUpdateDiagnostics(editor.document, diagnostics);
      }
    })
  );

  // Validate on document change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "poe2-filter") {
        validateAndUpdateDiagnostics(event.document, diagnostics);
      }
    })
  );
}

function validateAndUpdateDiagnostics(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection
) {
  if (document.languageId === "poe2-filter") {
    const problems = validateDocument(document);
    diagnostics.set(document.uri, problems);
  }
}

export function validateDocument(
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const problems: vscode.Diagnostic[] = [];
  let inBlock = false;

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const trimmedText = line.text.trim();

    // Skip empty lines and comments
    if (trimmedText === "" || trimmedText.startsWith("#")) {
      continue;
    }

    // Check block syntax
    if (trimmedText === "Show" || trimmedText === "Hide") {
      if (inBlock) {
        problems.push(
          createDiagnostic(
            line.range,
            "Nested blocks are not allowed",
            vscode.DiagnosticSeverity.Error
          )
        );
      }
      inBlock = true;
      continue;
    }

    // Check for common spelling mistakes
    const lowercaseCommand = trimmedText.split(" ")[0].toLowerCase();
    for (const [mistake, correction] of Object.entries(COMMON_MISTAKES)) {
      if (lowercaseCommand === mistake) {
        problems.push(
          createDiagnostic(
            new vscode.Range(
              line.range.start,
              line.range.start.translate(0, mistake.length)
            ),
            `Did you mean "${correction}"?`,
            vscode.DiagnosticSeverity.Warning
          )
        );
      }
    }

    // Validate commands and parameters
    const parts = trimmedText.split(" ");
    const command = parts[0];

    if (VALID_COMMANDS[command as keyof typeof VALID_COMMANDS]) {
      // Command exists, validate parameters
      if (command.endsWith("Color")) {
        validateColorParameters(line, parts, problems);
      }
      // Add more parameter validation as needed
    } else {
      // Unknown command
      problems.push(
        createDiagnostic(
          new vscode.Range(
            line.range.start,
            line.range.start.translate(0, command.length)
          ),
          `Unknown command "${command}"`,
          vscode.DiagnosticSeverity.Error
        )
      );
    }
  }

  return problems;
}

function validateColorParameters(
  line: vscode.TextLine,
  parts: string[],
  problems: vscode.Diagnostic[]
) {
  // Check number of parameters
  if (parts.length < 4) {
    problems.push(
      createDiagnostic(
        line.range,
        "Color commands require at least 3 parameters (R G B)",
        vscode.DiagnosticSeverity.Error
      )
    );
    return;
  }

  // Validate each color component
  const colorComponents = parts.slice(1, 5); // R G B [A]
  colorComponents.forEach((value, index) => {
    const num = parseInt(value);
    if (isNaN(num)) {
      problems.push(
        createDiagnostic(
          new vscode.Range(
            line.range.start.translate(0, line.text.indexOf(value)),
            line.range.start.translate(
              0,
              line.text.indexOf(value) + value.length
            )
          ),
          "Color values must be numbers",
          vscode.DiagnosticSeverity.Error
        )
      );
    } else if (num < 0 || num > 255) {
      problems.push(
        createDiagnostic(
          new vscode.Range(
            line.range.start.translate(0, line.text.indexOf(value)),
            line.range.start.translate(
              0,
              line.text.indexOf(value) + value.length
            )
          ),
          "Color values must be between 0 and 255",
          vscode.DiagnosticSeverity.Error
        )
      );
    }
  });
}

function createDiagnostic(
  range: vscode.Range,
  message: string,
  severity: vscode.DiagnosticSeverity
): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(range, message, severity);
  diagnostic.source = "poe2-filter";
  return diagnostic;
}
