import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const graph = execFileSync('terraform', ['graph'], {
  encoding: 'utf8',
});

const svg = execFileSync('dot', ['-Tsvg'], {
  input: graph,
  encoding: 'utf8',
});

const openingSvgTag = /<svg\b(?:[^>"']|"[^"]*"|'[^']*')*>/;
const match = openingSvgTag.exec(svg);

if (!match) {
  throw new Error('Graphviz output does not contain an opening SVG tag.');
}

const title = '<title>Backend Terraform infrastructure dependency graph</title>';
const contentAfterOpeningTag = svg.slice(match.index + match[0].length);

// Match a title only when it occurs immediately after the opening SVG tag.
const existingTitle = contentAfterOpeningTag.match(/^\s*<title(?:\s|>).*?<\/title>/);

let accessibleSvg: string;

if (existingTitle) {
  const beforeContent = svg.slice(0, match.index + match[0].length);
  const updatedContent = contentAfterOpeningTag.replace(
    existingTitle[0],
    title, // What should replace the old title?
  );
  accessibleSvg = beforeContent + updatedContent;
} else {
  // Insert the title immediately after the opening SVG tag.
  accessibleSvg = svg.replace(openingSvgTag, `$&\n${title}`);
}

writeFileSync('infrastructure.svg', accessibleSvg, 'utf8');
console.log('Generated infrastructure.svg with an accessible title.');
