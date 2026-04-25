import type { EvidenceBundle } from "../types.js";

function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, (c) => `\\${c}`);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const s = seconds % 60;
  return minutes > 0 ? `${minutes}m ${s}s` : `${s}s`;
}

export function renderEvidence(evidence: EvidenceBundle, originalPrompt: string): string {
  const parts: string[] = [];

  parts.push("✅ *Task done*");
  parts.push("");
  parts.push(`_${escapeMarkdownV2(originalPrompt.slice(0, 200))}_`);
  parts.push("");
  parts.push("*Summary*");
  parts.push(escapeMarkdownV2(evidence.summary.slice(0, 1500)));

  const { diff } = evidence;
  if (diff.filesChanged > 0) {
    parts.push("");
    parts.push(
      `*Changes* — ${diff.filesChanged} file\\(s\\), \\+${diff.insertions} −${diff.deletions}`,
    );
    const shown = diff.perFile.slice(0, 10);
    for (const f of shown) {
      parts.push(`  \`${escapeMarkdownV2(f.path)}\` \\(\\+${f.insertions} −${f.deletions}\\)`);
    }
    if (diff.perFile.length > 10) {
      parts.push(`  \\+${diff.perFile.length - 10} more`);
    }
  } else {
    parts.push("");
    parts.push("*Changes* — no files changed");
  }

  if (evidence.tests !== null) {
    const testStr = evidence.tests.passed ? "✅ passed" : "❌ failed";
    parts.push("");
    parts.push(`*Tests*: ${testStr}`);
  }

  const durationStr = escapeMarkdownV2(formatDuration(evidence.durationMs));
  const tokensStr = `${evidence.tokensInput}/${evidence.tokensOutput} tok`;
  let footer = `⏱ ${durationStr}   ${escapeMarkdownV2(tokensStr)}`;
  if (evidence.costUsd !== null) {
    const costStr = escapeMarkdownV2(evidence.costUsd.toFixed(4));
    footer = `⏱ ${durationStr}   💰 \\$${costStr} \\(${escapeMarkdownV2(tokensStr)}\\)`;
  }
  parts.push("");
  parts.push(footer);

  return parts.join("\n").slice(0, 4000);
}
