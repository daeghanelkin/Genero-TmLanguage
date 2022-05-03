# Genero-TmLanguage

This repository contains TmLanguage files that are consumed by Genero editors and plugins such as [Visual Studio Code](https://github.com/Microsoft/vscode), [Sublime](https://www.sublimetext.com/), [Atom](https://atom.io/), etc.

# Contributing

The XML files are generated from easier to read YAML files, so any potential contributions should be made through the YAML files. This allows the build script to generate the XML files, rather than having to be modified separately.

## Install dependencies

Simply run the following;

```
npm install
```

## Build

Compile the YAML files into their corresponding tmLanguage and tmTheme files via;
```
npm run build:grammar
```

## Tests

This is a work in progress, but theoretically this can be achieved by running the following commands;
```
npm test            # Compiles and runs tests

npm run diff        # Diffs the test baselines and the generated ones
npm run accept      # Accepts the test baseline
```
