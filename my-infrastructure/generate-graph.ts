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

const contentAfterOpeningTag = svg.slice(match.index + match[0].length);

if (/^\s*<title(?:\s|>)/.test(contentAfterOpeningTag)) {
  throw new Error(
    'Graphviz output already has a title directly inside the SVG.',
  );
}

const accessibleSvg = svg.replace(
  openingSvgTag,
  '$&\n<title>Backend Terraform infrastructure dependency graph</title>',
);

writeFileSync('infrastructure.svg', accessibleSvg, 'utf8');
console.log('Generated infrastructure.svg with an accessible title.');

