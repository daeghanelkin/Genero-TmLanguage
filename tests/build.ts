/*
 * Modified from Microsoft's TypeScript-TmLanguage repo
 * Source: https://github.com/microsoft/TypeScript-TmLanguage/
 * Modified to work with 4GL and PER files
 */

import * as path from "path";
import * as fs from "fs";
import * as vsctm from "vscode-textmate";
import * as oniguruma from 'vscode-oniguruma';

enum GrammarKind {
  Source = "source.4gl",
  Form = "source.per",
}
const grammarFileNames: Record<GrammarKind, string> = {
  [GrammarKind.Source]: "4GL.tmLanguage",
  [GrammarKind.Form]: "PER.tmLanguage",
};
function grammarPath(kind: GrammarKind) {
  return path.join(__dirname, "..", grammarFileNames[kind]);
}
const grammarPaths = {
  [GrammarKind.Source]: grammarPath(GrammarKind.Source),
  [GrammarKind.Form]: grammarPath(GrammarKind.Form),
};

const wasmBin = fs.readFileSync(path.join(__dirname, '../node_modules/vscode-oniguruma/release/onig.wasm')).buffer;
const vscodeOnigurumaLib: Promise<vsctm.IOnigLib> = oniguruma
  .loadWASM(wasmBin)
  .then(() => {
    return {
      createOnigScanner(sources: string[]) {
        return new oniguruma.OnigScanner(sources);
      },
      createOnigString(str: string) {
        return new oniguruma.OnigString(str); 
      }
    };
});

const registery = new vsctm.Registry({
  onigLib: vscodeOnigurumaLib,
  loadGrammar: function (scopeName: GrammarKind) {
    const path = grammarPaths[scopeName];
    if (path) {
      return new Promise((resolve, reject) => {
        fs.readFile(path, (error, content) => {
          if (error) {
            reject(error);
          } else {
            const rawGrammar = vsctm.parseRawGrammar(content.toString(), path);
            resolve(rawGrammar);
          }
        });
      });
    }

    return Promise.resolve(null);
  },
});

interface ThenableGrammar {
  kind: GrammarKind;
  grammar: Promise<vsctm.IGrammar | null>;
}
function thenableGrammar(kind: GrammarKind): ThenableGrammar {
  return { kind, grammar: registery.loadGrammar(kind) };
}
const sourceGrammar = thenableGrammar(GrammarKind.Source);
const formGrammar = thenableGrammar(GrammarKind.Form);

function getInputFile(oriLines: string[]): string {
  return (
    "original file\n-----------------------------------\n" +
    oriLines.join("\n") +
    "\n-----------------------------------\n\n"
  );
}

function getGrammarInfo(kind: GrammarKind) {
  return (
    "Grammar: " +
    grammarFileNames[kind] +
    "\n-----------------------------------\n"
  );
}

interface Grammar {
  kind: GrammarKind;
  grammar: vsctm.IGrammar;
  ruleStack?: vsctm.StateStack;
}
function initGrammar(kind: GrammarKind, grammar: vsctm.IGrammar): Grammar {
  return { kind, grammar };
}

function tokenizeLine(grammar: Grammar, line: string) {
  const lineTokens = grammar.grammar.tokenizeLine(line, grammar.ruleStack!);
  grammar.ruleStack = lineTokens.ruleStack;
  return lineTokens.tokens;
}

function hasDiff<T>(
  first: T[],
  second: T[],
  hasDiffT: (first: T, second: T) => boolean
): boolean {
  if (first.length != second.length) {
    return true;
  }

  for (let i = 0; i < first.length; i++) {
    if (hasDiffT(first[i], second[i])) {
      return true;
    }
  }

  return false;
}

function hasDiffScope(first: string, second: string) {
  return first !== second;
}

function hasDiffLineToken(first: vsctm.IToken, second: vsctm.IToken) {
  return (
    first.startIndex != second.startIndex ||
    first.endIndex != second.endIndex ||
    hasDiff(first.scopes, second.scopes, hasDiffScope)
  );
}

function getBaseline(grammar: Grammar, outputLines: string[]) {
  return getGrammarInfo(grammar.kind) + outputLines.join("\n");
}

export function generateScopes(text: string, parsedFileName: path.ParsedPath) {
  const mainGrammar =
    parsedFileName.ext === ".per" ? formGrammar : sourceGrammar;
  const oriLines = text.split(/\r\n|\r|\n/);
  const otherGrammar =
    oriLines[0].search(/\/\/\s*@onlyOwnGrammar/i) < 0
      ? mainGrammar === sourceGrammar
        ? sourceGrammar
        : formGrammar
      : undefined;

  return Promise.all([
    mainGrammar.grammar,
    otherGrammar ? otherGrammar.grammar : Promise.resolve(undefined),
  ]).then(([mainIGrammar, otherIGrammar]) =>
    generateScopesWorker(
      initGrammar(mainGrammar.kind, mainIGrammar!),
      otherIGrammar && initGrammar(otherGrammar!.kind, otherIGrammar),
      oriLines
    )
  );
}

function validateTokenScopeExtension(grammar: Grammar, token: vsctm.IToken) {
  return !token.scopes.some((scope) => !isValidScopeExtension(grammar, scope));
}

function isValidScopeExtension(grammar: Grammar, scope: string) {
  return scope
    .toUpperCase()
    .endsWith(grammar.kind === GrammarKind.Source ? ".4GL" : ".PER");
}

function generateScopesWorker(
  mainGrammar: Grammar,
  otherGrammar: Grammar | null | undefined,
  oriLines: string[]
): string {
  let cleanLines: string[] = [];
  let baselineLines: string[] = [];
  let otherBaselines: string[] = [];
  let markers = 0;
  let foundDiff = false;
  for (const i in oriLines) {
    let line = oriLines[i];

    const mainLineTokens = tokenizeLine(mainGrammar, line);

    cleanLines.push(line);
    baselineLines.push(">" + line);
    otherBaselines.push(">" + line);

    for (let token of mainLineTokens) {
      writeTokenLine(mainGrammar, token, baselineLines);
    }

    if (otherGrammar) {
      const otherLineTokens = tokenizeLine(otherGrammar, line);
      if (
        otherLineTokens.some(
          (token) => !validateTokenScopeExtension(otherGrammar, token)
        ) ||
        hasDiff(mainLineTokens, otherLineTokens, hasDiffLineToken)
      ) {
        foundDiff = true;
        for (let token of otherLineTokens) {
          writeTokenLine(otherGrammar, token, otherBaselines);
        }
      }
    }
  }

  const otherDiffBaseline = foundDiff
    ? "\n\n\n" + getBaseline(otherGrammar!, otherBaselines)
    : "";
  return (
    getInputFile(cleanLines) +
    getBaseline(mainGrammar, baselineLines) +
    otherDiffBaseline
  );
}

function writeTokenLine(
  grammar: Grammar,
  token: vsctm.IToken,
  outputLines: string[]
) {
  let startingSpaces = " ";
  for (let j = 0; j < token.startIndex; j++) {
    startingSpaces += " ";
  }

  let locatingString = "";
  for (let j = token.startIndex; j < token.endIndex; j++) {
    locatingString += "^";
  }
  outputLines.push(startingSpaces + locatingString);
  outputLines.push(
    `${startingSpaces}${token.scopes.join(" ")}${
      validateTokenScopeExtension(grammar, token)
        ? ""
        : " INCORRECT_SCOPE_EXTENSION"
    }`
  );
}
