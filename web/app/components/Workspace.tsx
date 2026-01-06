"use client";

import { useMemo, useState } from "react";

const matrixData = [
  { category: "Identity", scores: [5, 3, 4, 2, 1] },
  { category: "Timeline", scores: [4, 5, 3, 2, 1] },
  { category: "Financial", scores: [2, 3, 5, 4, 1] },
  { category: "Compliance", scores: [1, 2, 4, 5, 3] },
  { category: "Reputation", scores: [3, 1, 2, 4, 5] },
];

const documents = ["Doc A", "Doc B", "Doc C", "Doc D", "Doc E"];

export default function Workspace() {
  const [showExplanation, setShowExplanation] = useState(false);

  const matrixMax = useMemo(
    () => Math.max(...matrixData.flatMap((row) => row.scores)),
    [],
  );
  const matrixMin = useMemo(
    () => Math.min(...matrixData.flatMap((row) => row.scores)),
    [],
  );

  return (
    <main style={styles.page}>
      <header style={styles.topBar}>
        <div>
          <p style={styles.eyebrow}>CrossCheck Workspace</p>
          <h1 style={styles.title}>Standard workspace</h1>
        </div>
        <div style={styles.topBarMeta}>
          <div style={styles.metaBlock}>
            <span style={styles.metaLabel}>Active review</span>
            <span style={styles.metaValue}>Northwind Audit</span>
          </div>
          <div style={styles.metaBlock}>
            <span style={styles.metaLabel}>Operator</span>
            <span style={styles.metaValue}>Analyst Team</span>
          </div>
        </div>
      </header>

      <section style={styles.workspaceGrid}>
        <aside style={styles.nav}>
          <h2 style={styles.navTitle}>Workspace</h2>
          <ul style={styles.navList}>
            {[
              "Overview",
              "Criteria approvals",
              "Batch runs",
              "Shortlist",
              "Matrix",
              "Findings",
              "Explanations",
            ].map((item) => (
              <li key={item} style={styles.navItem}>
                {item}
              </li>
            ))}
          </ul>
          <div style={styles.navNote}>
            <p style={styles.navNoteTitle}>Queue</p>
            <p style={styles.navNoteValue}>3 active requests</p>
          </div>
        </aside>

        <div style={styles.content}>
          <section style={styles.card}>
            <header style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Standard workspace</h2>
                <p style={styles.cardSubtitle}>
                  Consolidated view of review status, coverage, and open actions.
                </p>
              </div>
              <div style={styles.badge}>Neutral mode</div>
            </header>
            <div style={styles.statsGrid}>
              {[
                { label: "Open criteria", value: "8" },
                { label: "Evidence sources", value: "24" },
                { label: "Queued batches", value: "3" },
                { label: "Findings flagged", value: "5" },
              ].map((item) => (
                <div key={item.label} style={styles.statCard}>
                  <p style={styles.statLabel}>{item.label}</p>
                  <p style={styles.statValue}>{item.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={styles.card}>
            <header style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Criteria approval UI</h2>
                <p style={styles.cardSubtitle}>
                  Track approvals without persuasive colors or priority signals.
                </p>
              </div>
            </header>
            <div style={styles.criteriaList}>
              {[
                {
                  name: "Identity verification",
                  owner: "M. Rivera",
                  status: "Pending review",
                },
                {
                  name: "Timeline consistency",
                  owner: "S. Ali",
                  status: "Approved",
                },
                {
                  name: "Financial evidence",
                  owner: "J. Cheng",
                  status: "Needs clarification",
                },
              ].map((item) => (
                <div key={item.name} style={styles.criteriaRow}>
                  <div>
                    <p style={styles.criteriaName}>{item.name}</p>
                    <p style={styles.criteriaMeta}>Owner: {item.owner}</p>
                  </div>
                  <span style={styles.statusTag}>{item.status}</span>
                </div>
              ))}
            </div>
          </section>

          <section style={styles.card}>
            <header style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Batch run UI</h2>
                <p style={styles.cardSubtitle}>
                  Configure queued jobs and monitor their neutral progress.
                </p>
              </div>
              <button style={styles.actionButton} type="button">
                New batch
              </button>
            </header>
            <div style={styles.batchGrid}>
              <div style={styles.batchPanel}>
                <p style={styles.batchLabel}>Run configuration</p>
                <div style={styles.batchField}>
                  <span>Scope</span>
                  <span style={styles.batchValue}>Full corpus</span>
                </div>
                <div style={styles.batchField}>
                  <span>Criteria set</span>
                  <span style={styles.batchValue}>Baseline v4</span>
                </div>
                <div style={styles.batchField}>
                  <span>Schedule</span>
                  <span style={styles.batchValue}>Tonight · 22:00</span>
                </div>
              </div>
              <div style={styles.batchPanel}>
                <p style={styles.batchLabel}>Queue status</p>
                {["Northwind", "Contoso", "Fabrikam"].map((name, index) => (
                  <div key={name} style={styles.queueRow}>
                    <span>{name}</span>
                    <span style={styles.queueMeta}>{index + 1} of 3</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section style={styles.card}>
            <header style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Ranked shortlist (orientation only)</h2>
                <p style={styles.cardSubtitle}>
                  Ranking is directional and does not imply recommendation.
                </p>
              </div>
            </header>
            <div style={styles.shortlist}>
              {[
                { name: "Casefile 204", score: "0.78", note: "Broad coverage" },
                { name: "Casefile 118", score: "0.74", note: "Missing citations" },
                { name: "Casefile 312", score: "0.69", note: "Sparse timeline" },
              ].map((item, index) => (
                <div key={item.name} style={styles.shortlistRow}>
                  <div style={styles.rankCircle}>{index + 1}</div>
                  <div>
                    <p style={styles.shortlistName}>{item.name}</p>
                    <p style={styles.shortlistNote}>{item.note}</p>
                  </div>
                  <span style={styles.scorePill}>{item.score}</span>
                </div>
              ))}
            </div>
          </section>

          <section style={styles.card}>
            <header style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Category × Document matrix</h2>
                <p style={styles.cardSubtitle}>
                  Matrix colors serve only as ordering cues.
                </p>
              </div>
            </header>
            <div style={styles.matrixWrapper}>
              <table style={styles.matrixTable}>
                <thead>
                  <tr>
                    <th style={styles.matrixHeader}></th>
                    {documents.map((doc) => (
                      <th key={doc} style={styles.matrixHeader}>
                        {doc}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixData.map((row) => (
                    <tr key={row.category}>
                      <td style={styles.matrixRowHeader}>{row.category}</td>
                      {row.scores.map((score, index) => (
                        <td
                          key={`${row.category}-${index}`}
                          style={buildMatrixCellStyle(score, matrixMin, matrixMax)}
                        >
                          {score}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={styles.matrixCaption}>
                Lower values indicate lower ordering in the cue scale.
              </p>
            </div>
          </section>

          <section style={styles.card}>
            <header style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Finding drilldown</h2>
                <p style={styles.cardSubtitle}>
                  Evidence snippets with neutral summary and traceable sources.
                </p>
              </div>
            </header>
            <div style={styles.drilldownGrid}>
              <div style={styles.drilldownPanel}>
                <p style={styles.drilldownLabel}>Selected finding</p>
                <h3 style={styles.drilldownTitle}>Timeline inconsistency</h3>
                <p style={styles.drilldownText}>
                  Two submitted statements list overlapping delivery windows.
                </p>
                <div style={styles.drilldownTags}>
                  {[
                    "Confidence: Moderate",
                    "Last updated 2h ago",
                    "Reviewer: J. Cheng",
                  ].map((tag) => (
                    <span key={tag} style={styles.tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div style={styles.drilldownPanel}>
                <p style={styles.drilldownLabel}>Evidence trail</p>
                <ul style={styles.evidenceList}>
                  {[
                    "Doc B · Contract timeline section",
                    "Doc C · Vendor schedule appendix",
                    "Doc D · Email thread summary",
                  ].map((item) => (
                    <li key={item} style={styles.evidenceItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section style={styles.card}>
            <header style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Canonical explanation collapse (opt-in)</h2>
                <p style={styles.cardSubtitle}>
                  Show the canonical explanation only when explicitly requested.
                </p>
              </div>
              <button
                style={styles.toggleButton}
                type="button"
                onClick={() => setShowExplanation((prev) => !prev)}
                aria-expanded={showExplanation}
              >
                {showExplanation ? "Hide explanation" : "Show explanation"}
              </button>
            </header>
            {showExplanation ? (
              <div style={styles.explanationPanel}>
                <p style={styles.explanationText}>
                  The canonical explanation consolidates citations across the
                  evidence set. It is intentionally collapsed by default to keep
                  reviewers focused on source materials first.
                </p>
                <ul style={styles.explanationList}>
                  <li>Linked sources: Doc A, Doc C, Doc D</li>
                  <li>Change log: Updated after batch run 3</li>
                  <li>Reviewer notes: Requires secondary confirmation</li>
                </ul>
              </div>
            ) : (
              <p style={styles.explanationPlaceholder}>
                Explanation is hidden until requested.
              </p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function buildMatrixCellStyle(score: number, min: number, max: number) {
  const normalized = (score - min) / (max - min || 1);
  const intensity = Math.round(230 - normalized * 70);
  return {
    ...styles.matrixCell,
    background: `rgb(${intensity}, ${intensity}, ${intensity})`,
  } as const;
}

const styles = {
  page: {
    minHeight: "100vh",
    fontFamily: "system-ui, -apple-system, sans-serif",
    background: "#f5f5f4",
    color: "#111827",
    padding: "32px 40px 64px",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "24px",
    marginBottom: "32px",
  },
  eyebrow: {
    margin: 0,
    fontSize: "0.85rem",
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    color: "#6b7280",
  },
  title: {
    margin: "6px 0 0",
    fontSize: "2.25rem",
    fontWeight: 600,
  },
  topBarMeta: {
    display: "flex",
    gap: "16px",
  },
  metaBlock: {
    padding: "12px 16px",
    borderRadius: "12px",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    minWidth: "160px",
  },
  metaLabel: {
    display: "block",
    fontSize: "0.75rem",
    color: "#6b7280",
    marginBottom: "6px",
  },
  metaValue: {
    fontSize: "1rem",
    fontWeight: 600,
  },
  workspaceGrid: {
    display: "grid",
    gridTemplateColumns: "220px 1fr",
    gap: "28px",
  },
  nav: {
    padding: "20px",
    borderRadius: "16px",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    height: "fit-content",
  },
  navTitle: {
    fontSize: "0.9rem",
    marginBottom: "16px",
    color: "#374151",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  navList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "grid",
    gap: "12px",
  },
  navItem: {
    padding: "8px 10px",
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    fontSize: "0.9rem",
    color: "#374151",
  },
  navNote: {
    marginTop: "20px",
    paddingTop: "16px",
    borderTop: "1px solid #e5e7eb",
  },
  navNoteTitle: {
    margin: 0,
    fontSize: "0.8rem",
    color: "#6b7280",
  },
  navNoteValue: {
    margin: "6px 0 0",
    fontSize: "1rem",
    fontWeight: 600,
  },
  content: {
    display: "grid",
    gap: "24px",
  },
  card: {
    padding: "24px",
    borderRadius: "20px",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    boxShadow: "0 12px 24px rgba(15, 23, 42, 0.06)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    marginBottom: "16px",
  },
  cardTitle: {
    margin: 0,
    fontSize: "1.3rem",
    fontWeight: 600,
  },
  cardSubtitle: {
    margin: "6px 0 0",
    color: "#6b7280",
    maxWidth: "520px",
  },
  badge: {
    padding: "6px 12px",
    borderRadius: "999px",
    fontSize: "0.8rem",
    border: "1px solid #d1d5db",
    background: "#f3f4f6",
    color: "#4b5563",
    whiteSpace: "nowrap" as const,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "16px",
  },
  statCard: {
    padding: "16px",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
  },
  statLabel: {
    margin: 0,
    fontSize: "0.8rem",
    color: "#6b7280",
  },
  statValue: {
    margin: "8px 0 0",
    fontSize: "1.4rem",
    fontWeight: 600,
  },
  criteriaList: {
    display: "grid",
    gap: "12px",
  },
  criteriaRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "14px 16px",
    borderRadius: "14px",
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
  },
  criteriaName: {
    margin: 0,
    fontWeight: 600,
  },
  criteriaMeta: {
    margin: "6px 0 0",
    color: "#6b7280",
    fontSize: "0.85rem",
  },
  statusTag: {
    padding: "6px 12px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    fontSize: "0.8rem",
    background: "#f3f4f6",
    color: "#374151",
    whiteSpace: "nowrap" as const,
  },
  actionButton: {
    padding: "10px 16px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    background: "#f3f4f6",
    color: "#111827",
    fontWeight: 600,
    cursor: "pointer",
  },
  batchGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
  },
  batchPanel: {
    padding: "16px",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
  },
  batchLabel: {
    margin: 0,
    fontSize: "0.85rem",
    color: "#6b7280",
  },
  batchField: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "12px",
    fontSize: "0.9rem",
  },
  batchValue: {
    fontWeight: 600,
  },
  queueRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid #e5e7eb",
  },
  queueMeta: {
    color: "#6b7280",
  },
  shortlist: {
    display: "grid",
    gap: "12px",
  },
  shortlistRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    gap: "12px",
    alignItems: "center",
    padding: "12px 16px",
    borderRadius: "14px",
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
  },
  rankCircle: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    fontWeight: 600,
  },
  shortlistName: {
    margin: 0,
    fontWeight: 600,
  },
  shortlistNote: {
    margin: "4px 0 0",
    color: "#6b7280",
    fontSize: "0.85rem",
  },
  scorePill: {
    padding: "6px 10px",
    borderRadius: "999px",
    border: "1px solid #d1d5db",
    fontSize: "0.85rem",
    background: "#ffffff",
    color: "#374151",
  },
  matrixWrapper: {
    overflowX: "auto" as const,
  },
  matrixTable: {
    width: "100%",
    borderCollapse: "collapse" as const,
    textAlign: "center" as const,
    minWidth: "520px",
  },
  matrixHeader: {
    padding: "10px",
    fontSize: "0.85rem",
    color: "#6b7280",
    borderBottom: "1px solid #e5e7eb",
  },
  matrixRowHeader: {
    padding: "10px",
    textAlign: "left" as const,
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "#374151",
    borderBottom: "1px solid #e5e7eb",
  },
  matrixCell: {
    padding: "12px",
    borderBottom: "1px solid #e5e7eb",
    borderLeft: "1px solid #f3f4f6",
    fontWeight: 600,
  },
  matrixCaption: {
    margin: "12px 0 0",
    color: "#6b7280",
    fontSize: "0.85rem",
  },
  drilldownGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "16px",
  },
  drilldownPanel: {
    padding: "16px",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
  },
  drilldownLabel: {
    margin: 0,
    fontSize: "0.8rem",
    color: "#6b7280",
  },
  drilldownTitle: {
    margin: "8px 0 0",
    fontSize: "1.1rem",
  },
  drilldownText: {
    margin: "8px 0 0",
    color: "#4b5563",
  },
  drilldownTags: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "8px",
    marginTop: "12px",
  },
  tag: {
    padding: "4px 8px",
    borderRadius: "999px",
    border: "1px solid #d1d5db",
    fontSize: "0.75rem",
    color: "#4b5563",
    background: "#ffffff",
  },
  evidenceList: {
    margin: "12px 0 0",
    padding: 0,
    listStyle: "none",
    display: "grid",
    gap: "8px",
    color: "#374151",
  },
  evidenceItem: {
    padding: "8px 10px",
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    background: "#ffffff",
  },
  toggleButton: {
    padding: "8px 14px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    cursor: "pointer",
    fontWeight: 600,
    color: "#374151",
  },
  explanationPanel: {
    padding: "16px",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
  },
  explanationText: {
    margin: 0,
    color: "#4b5563",
  },
  explanationList: {
    margin: "12px 0 0",
    paddingLeft: "18px",
    color: "#374151",
  },
  explanationPlaceholder: {
    margin: 0,
    color: "#6b7280",
  },
} as const;
