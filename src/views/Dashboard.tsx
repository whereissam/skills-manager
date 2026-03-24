import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, CheckCircle2, Bot, Plus, Download, AlertTriangle, Archive, Sparkles, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import * as api from "../lib/tauri";
import type { ManagedSkill, SkillsShSkill } from "../lib/tauri";
import { getScenarioIconOption } from "../lib/scenarioIcons";

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeScenario, tools, managedSkills, openSkillDetailById } = useApp();
  const [skills, setSkills] = useState<ManagedSkill[]>([]);
  const [suggestions, setSuggestions] = useState<SkillsShSkill[]>([]);
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
  const suggestionsCache = useRef<{ key: string; data: SkillsShSkill[] } | null>(null);

  const installed = tools.filter((t) => t.installed).length;
  const total = tools.length;
  const synced = skills.filter((s) => s.targets.length > 0).length;
  const scenarioIcon = getScenarioIconOption(activeScenario);
  const ScenarioIcon = scenarioIcon.icon;

  useEffect(() => {
    if (activeScenario) {
      api.getSkillsForScenario(activeScenario.id).then(setSkills).catch(() => { });
    }
  }, [activeScenario]);

  // Derived: unsynced skills (in scenario but no targets)
  const unsyncedSkills = skills.filter((s) => s.targets.length === 0);

  // Derived: unused skills (not in any scenario)
  const unusedSkills = managedSkills.filter((s) => s.scenario_ids.length === 0);

  // Sync handler
  const handleSyncFirst = useCallback(async (skill: ManagedSkill) => {
    const installedTool = tools.find((t) => t.installed);
    if (!installedTool) return;
    try {
      await api.syncSkillToTool(skill.id, installedTool.key);
      if (activeScenario) {
        const updated = await api.getSkillsForScenario(activeScenario.id);
        setSkills(updated);
      }
    } catch { /* ignore */ }
  }, [tools, activeScenario]);

  // Remove handler
  const handleRemoveSkill = useCallback(async (skill: ManagedSkill) => {
    try {
      await api.deleteManagedSkill(skill.id);
    } catch { /* ignore */ }
  }, []);

  // Feature 2: Auto-suggest skills
  useEffect(() => {
    if (tools.length === 0 || managedSkills.length === 0) return;

    const installedTools = tools.filter((t) => t.installed);
    const topTools = installedTools.slice(0, 2);
    if (topTools.length === 0) return;

    const cacheKey = topTools.map((t) => t.key).join(",");
    if (suggestionsCache.current?.key === cacheKey) {
      setSuggestions(suggestionsCache.current.data);
      return;
    }

    const installedRefs = new Set(
      managedSkills.map((s) => s.source_ref).filter(Boolean)
    );

    Promise.all(topTools.map((t) => api.searchSkillssh(t.key, 3).catch(() => [] as SkillsShSkill[])))
      .then((results) => {
        const all = results.flat();
        const filtered = all
          .filter((s) => !installedRefs.has(s.source))
          .filter((s, i, arr) => arr.findIndex((x) => x.skill_id === s.skill_id) === i)
          .slice(0, 4);
        suggestionsCache.current = { key: cacheKey, data: filtered };
        setSuggestions(filtered);
      })
      .catch(() => { });
  }, [tools, managedSkills]);

  // Install suggestion handler
  const handleInstallSuggestion = useCallback(async (skill: SkillsShSkill) => {
    setInstallingIds((prev) => new Set(prev).add(skill.skill_id));
    try {
      await api.installFromSkillssh(skill.source, skill.skill_id);
      setSuggestions((prev) => prev.filter((s) => s.skill_id !== skill.skill_id));
    } catch { /* ignore */ }
    setInstallingIds((prev) => {
      const next = new Set(prev);
      next.delete(skill.skill_id);
      return next;
    });
  }, []);

  return (
    <div className="app-page app-page-narrow">
      <div className="app-page-header">
        <h1 className="app-page-title">{t("dashboard.greeting")}</h1>
        <p className="app-page-subtitle flex items-center gap-2 flex-wrap text-tertiary">
          {t("dashboard.currentScenario")}：
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium ${scenarioIcon.activeClass} ${scenarioIcon.colorClass}`}
          >
            <ScenarioIcon className="h-3 w-3" />
            {activeScenario?.name || "—"}
          </span>
          <span className="text-faint">·</span>
          <span>{t("dashboard.skillsEnabled", { count: skills.length })}</span>
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3.5">
        {[
          {
            title: t("dashboard.scenarioSkills"),
            value: String(skills.length),
            icon: Layers,
            color: "text-accent-light",
            bg: "bg-accent-bg",
          },
          {
            title: t("dashboard.synced"),
            value: String(synced),
            icon: CheckCircle2,
            color: "text-emerald-400",
            bg: "bg-emerald-500/[0.08]",
          },
          {
            title: t("dashboard.supportedAgents"),
            value: `${installed}/${total}`,
            icon: Bot,
            color: "text-amber-400",
            bg: "bg-amber-500/[0.08]",
          },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={i}
              className="app-panel flex items-center justify-between px-4 py-4 transition-colors hover:border-border"
            >
              <div>
                <p className="app-section-title mb-1">
                  {stat.title}
                </p>
                <h3 className="text-xl font-semibold text-primary leading-none">{stat.value}</h3>
              </div>
              <div className={`p-2 rounded-md ${stat.bg} ${stat.color} border border-border-subtle`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate("/install?tab=local")}
          className="app-button-primary flex-1"
        >
          <Download className="w-4 h-4" />
          {t("dashboard.scanImport")}
        </button>
        <button
          onClick={() => navigate("/install")}
          className="app-button-secondary flex-1"
        >
          <Plus className="w-4 h-4 text-tertiary" />
          {t("dashboard.installNew")}
        </button>
      </div>

      {/* Skill Usage Stats */}
      {unsyncedSkills.length > 0 && (
        <div>
          <h2 className="app-section-title mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            {t("dashboard.unsyncedSkills", { defaultValue: "Unsynced Skills" })}
            <span className="text-muted text-[11px] font-normal">({unsyncedSkills.length})</span>
          </h2>
          <div className="app-panel overflow-hidden divide-y divide-border-subtle">
            {unsyncedSkills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center justify-between px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-[4px] flex items-center justify-center text-[13px] font-semibold bg-amber-500/[0.08] text-amber-400 shrink-0">
                    {skill.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[13px] text-secondary font-medium">{skill.name}</span>
                </div>
                <button
                  onClick={() => handleSyncFirst(skill)}
                  className="app-button-primary text-[12px] px-2.5 py-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  {t("dashboard.sync", { defaultValue: "Sync" })}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {unusedSkills.length > 0 && (
        <div>
          <h2 className="app-section-title mb-2.5 flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5 text-muted" />
            {t("dashboard.unusedSkills", { defaultValue: "Unused Skills" })}
            <span className="text-muted text-[11px] font-normal">({unusedSkills.length})</span>
          </h2>
          <div className="app-panel overflow-hidden divide-y divide-border-subtle">
            {unusedSkills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center justify-between px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-[4px] flex items-center justify-center text-[13px] font-semibold bg-surface-hover text-muted shrink-0">
                    {skill.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[13px] text-secondary font-medium">{skill.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {activeScenario && (
                    <button
                      onClick={async () => {
                        try {
                          await api.addSkillToScenario(skill.id, activeScenario.id);
                          const updated = await api.getSkillsForScenario(activeScenario.id);
                          setSkills(updated);
                        } catch { /* ignore */ }
                      }}
                      className="app-button-secondary text-[12px] px-2.5 py-1"
                    >
                      <Plus className="w-3 h-3" />
                      {t("dashboard.addToScenario", { defaultValue: "Add to scenario" })}
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveSkill(skill)}
                    className="app-button-secondary text-[12px] px-2.5 py-1 text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t("dashboard.remove", { defaultValue: "Remove" })}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Skills */}
      {suggestions.length > 0 && managedSkills.length > 0 && tools.length > 0 && (
        <div>
          <h2 className="app-section-title mb-2.5 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-accent-light" />
            {t("dashboard.suggestedSkills", { defaultValue: "Suggested Skills" })}
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {suggestions.map((skill) => (
              <div
                key={skill.skill_id}
                className="app-panel px-3.5 py-3 flex flex-col gap-2"
              >
                <div>
                  <h4 className="text-[13px] text-secondary font-medium truncate">{skill.name}</h4>
                  <p className="text-[11px] text-muted mt-0.5 truncate">{skill.source}</p>
                </div>
                <button
                  disabled={installingIds.has(skill.skill_id)}
                  onClick={() => handleInstallSuggestion(skill)}
                  className="app-button-primary text-[12px] px-2.5 py-1 self-start"
                >
                  <Download className="w-3 h-3" />
                  {installingIds.has(skill.skill_id)
                    ? t("dashboard.installing", { defaultValue: "Installing..." })
                    : t("dashboard.install", { defaultValue: "Install" })}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent skills */}
      {skills.length > 0 && (
        <div>
          <h2 className="app-section-title mb-2.5">
            {t("dashboard.recentActivity")}
          </h2>
          <div className="app-panel overflow-hidden divide-y divide-border-subtle">
            {skills.slice(0, 5).map((skill) => (
              <div
                key={skill.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  openSkillDetailById(skill.id);
                  navigate("/my-skills");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    openSkillDetailById(skill.id);
                    navigate("/my-skills");
                  }
                }}
                className="flex items-center justify-between px-3.5 py-2.5 hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-[4px] flex items-center justify-center text-[13px] font-semibold bg-accent-bg text-accent-light shrink-0">
                    {skill.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-[13px] text-secondary font-medium flex items-center gap-1.5">
                      {skill.name}
                      <span className="text-[9px] px-1.5 py-px rounded bg-surface-hover text-muted border border-border font-normal">
                        {skill.source_type}
                      </span>
                    </h4>
                    <p className="text-[13px] text-muted mt-px">
                      {skill.targets.length > 0
                        ? `${t("dashboard.synced")} → ${skill.targets.map((t) => t.tool).join(", ")}`
                        : "未同步"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
