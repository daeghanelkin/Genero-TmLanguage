/*
 * Modified from Microsoft's TypeScript-TmLanguage repo
 * Source: https://github.com/microsoft/TypeScript-TmLanguage/
 * Modified to work with 4GL and PER files
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import * as plist from "plist";

/**
 * Types of languages supported by the build
 */
enum Language {
  Source = "4GL",
  Form = "PER",
}

/**
 * File extensions required for the build
 */
enum Extension {
  TmLanguage = "tmLanguage",
  TmTheme = "tmTheme",
  YamlTmLanguage = "YAML-tmLanguage",
  YamlTmTheme = "YAML-tmTheme",
}

function file(language: Language, extension: Extension): string {
  return path.join(__dirname, "..", `${language}.${extension}`);
}

function writePlistFile(grammar: TmGrammar | TmTheme, fileName: string): void {
  const text = plist.build(grammar);
  fs.writeFileSync(fileName, text);
}

function readYaml(fileName: string): unknown {
  const text = fs.readFileSync(fileName, "utf8");
  return yaml.load(text);
}

function transformGrammarRule(
  rule: any,
  propertyNames: string[],
  transformProperty: (ruleProperty: string) => string
): void {
  for (const propertyName of propertyNames) {
    const value = rule[propertyName];
    if (typeof value === "string") {
      rule[propertyName] = transformProperty(value);
    }
  }

  for (var propertyName in rule) {
    const value = rule[propertyName];
    if (typeof value === "object") {
      transformGrammarRule(value, propertyNames, transformProperty);
    }
  }
}

function transformGrammarRepository(
  grammar: TmGrammar,
  propertyNames: string[],
  transformProperty: (ruleProperty: string) => string
): void {
  const repository = grammar.repository;
  for (let key in repository) {
    transformGrammarRule(repository[key], propertyNames, transformProperty);
  }
}

function replacePatternVariables(
  pattern: string,
  variableReplacers: VariableReplacer[]
): string {
  let result = pattern;
  for (const [variableName, value] of variableReplacers) {
    result = result.replace(variableName, value);
  }
  return result;
}

type VariableReplacer = [RegExp, string];

function updateGrammarVariables(
  grammar: TmGrammar,
  variables: MapLike<string>
): TmGrammar {
  delete grammar.variables;
  const variableReplacers: VariableReplacer[] = [];
  for (const variableName in variables) {
    // Replace the pattern with earlier variables
    const pattern = replacePatternVariables(
      variables[variableName],
      variableReplacers
    );
    variableReplacers.push([new RegExp(`{{${variableName}}}`, "gim"), pattern]);
  }
  transformGrammarRepository(grammar, ["begin", "end", "match"], (pattern) =>
    replacePatternVariables(pattern, variableReplacers)
  );
  return grammar;
}

function getGrammar(
  language: Language,
  getVariables: (tsGrammarVariables: MapLike<string>) => MapLike<string>
): TmGrammar {
  const grammarBeforeTransformation = readYaml(
    file(language, Extension.YamlTmLanguage)
  ) as TmGrammar;
  return updateGrammarVariables(
    grammarBeforeTransformation,
    getVariables(grammarBeforeTransformation.variables as MapLike<string>)
  );
}

function writeGrammarToPlistFile(language: Language, extension: Extension) : void
{
  const grammar = getGrammar(
    language,
    (grammarVariables) => grammarVariables
  );

  writePlistFile(grammar, file(language, extension));
}

function buildGrammar(): void {
  // Write 4GL.tmLanguage
  writeGrammarToPlistFile(Language.Source, Extension.TmLanguage);

  // Write PER.tmLanguage
  writeGrammarToPlistFile(Language.Form, Extension.TmLanguage);
}

buildGrammar();
