# Project Wiki: Glossary: Social Media Accessibility Checker Extension (SMACE)

Domain terms specific to SMACE, defined as the team meets them. Terms that apply across every project are in the global wiki's glossary.

## Alt text

A text description of an image, read aloud by screen readers. LinkedIn provides a placeholder string ("no alternative text description for this image") that the extension treats as a failure.

## axe-core

An open-source accessibility testing engine from Deque Systems. Used by the extension's CI accessibility workflow to check WCAG 2.2 AAA conformance.

## Decorative Unicode font

Unicode mathematical alphanumeric characters (code points U+1D400–U+1D7FF) used as bold or italic text in social media posts. These are invisible to screen readers because they are not standard Latin characters.

## Emoji overuse

The extension flags posts with more than five emoji characters as a potential accessibility barrier.

## ONNX Runtime Web

An open-source inference engine for machine learning models running in a browser via WebAssembly. Used by SMACE to run PP-OCRv5 locally without sending data to a server.

## PP-OCRv5

The OCR (optical character recognition) model bundled with SMACE. Runs on ONNX Runtime Web to extract text from images on the user's device.

## Sandboxed page

A Chrome extension page loaded with a restrictive Content Security Policy that disables Chrome extension APIs. Used by SMACE to host the ONNX Runtime WebAssembly OCR model, which requires `wasm-unsafe-eval`.

## SMACE

Social Media Accessibility Checker Extension. A Chrome Manifest V3 browser extension that audits LinkedIn posts for accessibility issues.

## Webpack

The JavaScript module bundler used to compile the SMACE source into the `dist/` folder that Chrome loads as the extension.

## WCAG 2.2 AAA

Web Content Accessibility Guidelines version 2.2, at the highest conformance level (AAA). The target conformance level for all team projects.
