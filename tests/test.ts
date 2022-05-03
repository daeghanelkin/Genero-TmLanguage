/*
 * Modified from Microsoft's TypeScript-TmLanguage repo
 * Source: https://github.com/microsoft/TypeScript-TmLanguage/
 * Modified to work with 4GL and PER files
 */

import fs = require('fs');
import path = require('path');
import chai = require('chai');
import build = require('./build');

enum TestType {
    Form = "form",
    Source = "source"
}

const generatedFolder = path.join(__dirname, 'generated');
const sourceGeneratedFolder = path.join(generatedFolder, TestType.Source)
const formGeneratedFolder = path.join(generatedFolder, TestType.Form)
const baselineFolder = path.join(__dirname, 'baselines');
const casesFolder = path.join(__dirname, 'cases');

function ensureCleanGeneratedFolder() {
    if (fs.existsSync(generatedFolder)) {
        fs.rmSync(generatedFolder, { recursive: true });
    }
    fs.mkdirSync(generatedFolder);
    fs.mkdirSync(sourceGeneratedFolder);
    fs.mkdirSync(formGeneratedFolder);
}

// Ensure generated folder
ensureCleanGeneratedFolder();

function generateBaselines(testType: TestType): void {
    console.log(`Generating ${testType} baselines`)

    const testFolder = path.join(casesFolder, testType)
    // Generate the new baselines
    for (const fileName of fs.readdirSync(testFolder)) {
        describe("Generating baseline for " + fileName, () => {
            let wholeBaseline: string;
            let parsedFileName: path.ParsedPath;

            before(done => {
                const text = fs.readFileSync(path.join(testFolder, fileName), 'utf8');
                parsedFileName  = path.parse(fileName);
                build.generateScopes(text, parsedFileName).then(result => {
                    wholeBaseline = result;
                    done();
                })
            });
            after(() => {
                wholeBaseline = undefined!;
                parsedFileName = undefined!;
            });

            it('Comparing baseline', () => {
                assertBaselinesMatch(testType, `${parsedFileName.name}.baseline.txt`, wholeBaseline);
            });
        });
    }
}

// Generate source (.4gl) baselines
generateBaselines(TestType.Source)

// Generate form (.per) baseline
generateBaselines(TestType.Form)

function assertBaselinesMatch(testType: TestType, file: string, generatedText: string) {
    const generatedFileName = path.join(generatedFolder, testType, file);
    fs.writeFileSync(generatedFileName, generatedText);

    const baselineFile = path.join(baselineFolder, testType, file);
    if (fs.existsSync(baselineFile)) {
        chai.assert.equal(generatedText, fs.readFileSync(baselineFile, 'utf8'), "Expected baselines to match: " + file);
    } else {
        chai.assert(false, "New generated baseline");
    }
}