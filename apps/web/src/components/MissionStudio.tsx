import { useEffect, useRef, useState } from "react";
import type { LunarFeature, SearchRequest } from "../lib/types";
import { interpretBrief } from "../lib/brief";
import type { BriefInterpretation } from "../lib/brief";
import { downloadJson, utcDate } from "../lib/format";
import {
  MISSION_PRESETS,
  isMissionRequest,
  readSavedMissions,
  writeSavedMissions,
} from "../lib/missions";
import type { SavedMission } from "../lib/missions";
import { normalizePreferences } from "../lib/weights";
import { validateSearch } from "../lib/api";
import { Icon } from "./Icon";

export function MissionBrief({
  value,
  features,
  onApply,
}: {
  value: SearchRequest;
  features: LunarFeature[];
  onApply: (request: SearchRequest) => void;
}) {
  const [text, setText] = useState(""),
    [interpretation, setInterpretation] = useState<BriefInterpretation | null>(
      null,
    ),
    [notice, setNotice] = useState("");
  useEffect(() => setInterpretation(null), [value]);
  return (
    <details className="mission-brief">
      <summary>
        <span>
          <Icon name="compass" size={18} />
          <span>
            <strong>Start with a mission brief</strong>
            <small>Describe dates, a region, constraints, or priorities.</small>
          </span>
        </span>
        <span className="subtle-badge">LOCAL PHRASE PARSER</span>
      </summary>
      <div className="brief-body">
        <label className="sr-only" htmlFor="mission-brief-input">
          Describe your mission
        </label>
        <textarea
          id="mission-brief-input"
          rows={3}
          maxLength={1000}
          placeholder="Near Shackleton for October 2028, maximum slope 10°, minimum Earth visibility 50%, prioritize sunlight."
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setInterpretation(null);
            setNotice("");
          }}
        />
        <div className="brief-actions">
          <span className="field-hint">
            Recognizes documented phrases; it does not generate metrics or
            choose a landing site.
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={!text.trim()}
            onClick={() => {
              setInterpretation(interpretBrief(text, value, features));
              setNotice("");
            }}
          >
            Review interpretation
            <Icon name="arrow" size={14} />
          </button>
        </div>
        <div className="brief-examples">
          <span>Try a brief</span>
          {[
            "Near Shackleton for October 2028, maximum slope 10°, prioritize Earth visibility",
            "November 2028, maximum slope 8°, minimum sunlight 40%, prioritize terrain",
          ].map((example, i) => (
            <button
              type="button"
              key={example}
              onClick={() => {
                setText(example);
                setInterpretation(null);
                setNotice("");
              }}
            >
              {i === 0 ? "Shackleton mission" : "Terrain first"}
            </button>
          ))}
        </div>
        {interpretation && (
          <div className="brief-review" role="status">
            <h3>Review before applying</h3>
            {interpretation.errors.length > 0 && (
              <div className="error-box">
                {interpretation.errors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            )}
            <div className="brief-changes">
              {interpretation.changes.map((change, i) => (
                <span key={`${change}-${i}`}>
                  <Icon name="check" size={12} />
                  {change}
                </span>
              ))}
            </div>
            <p>
              {utcDate(interpretation.request.time_range.start_utc)} →{" "}
              {utcDate(interpretation.request.time_range.end_utc)}{" "}
              <span className="muted">UTC · exclusive end</span>
            </p>
            <p className="small muted">
              Region:{" "}
              {interpretation.request.region.input_text ??
                (interpretation.request.region.selector_type ===
                "full_supported_region"
                  ? "Prepared study area"
                  : "Custom coordinates")}
              {interpretation.request.region.search_radius_km
                ? ` · ${interpretation.request.region.search_radius_km} km radius`
                : ""}
            </p>
            <div className="brief-priorities">
              {Object.entries(
                normalizePreferences(interpretation.request.preferences),
              ).map(([key, weight]) => (
                <span key={key}>
                  {key
                    .replaceAll("_", " ")
                    .replace("terrain safety", "terrain suitability")}{" "}
                  <strong>{Math.round(weight * 100)}%</strong>
                </span>
              ))}
            </div>
            <ul>
              {interpretation.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
            <button
              type="button"
              className="primary-button"
              disabled={interpretation.errors.length > 0}
              onClick={() => {
                onApply(interpretation.request);
                setInterpretation(null);
                setNotice(
                  "Interpretation applied to the mission form. Review the fields, then run the search.",
                );
              }}
            >
              Apply to mission form
              <Icon name="check" size={14} />
            </button>
          </div>
        )}
        {notice && (
          <p className="success-note" role="status">
            {notice}
          </p>
        )}
      </div>
    </details>
  );
}

export function MissionLibrary({
  value,
  scienceAvailable,
  onLoad,
  onClose,
}: {
  value: SearchRequest;
  scienceAvailable: boolean;
  onLoad: (request: SearchRequest) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    file = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<SavedMission[]>(readSavedMissions),
    [name, setName] = useState("My polar mission"),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const current = dialog.current;
    current?.showModal();
    return () => current?.close();
  }, []);
  async function load(request: SearchRequest) {
    setLoading(true);
    setError(null);
    try {
      await validateSearch(request);
      onLoad(structuredClone(request));
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The mission configuration could not be validated.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function importFile(selected: File | undefined) {
    if (!selected) return;
    setError(null);
    if (selected.size > 25 * 1024 * 1024) {
      setError("Choose a configuration or analysis report under 25 MB.");
      return;
    }
    try {
      const payload = JSON.parse(await selected.text());
      const request = payload?.request ?? payload;
      if (!isMissionRequest(request))
        throw new Error(
          "This file does not contain a mission request. Import a Lumen configuration or analysis report.",
        );
      await load(request);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not read this JSON file.",
      );
    }
    if (file.current) file.current.value = "";
  }
  function persist(next: SavedMission[]) {
    try {
      writeSavedMissions(next);
      setSaved(next);
      return true;
    } catch {
      setError(
        "Browser storage is unavailable or full. Export the mission as JSON to keep a copy.",
      );
      return false;
    }
  }
  return (
    <dialog
      ref={dialog}
      className="methods-dialog mission-library"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="library-title"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">MISSION LIBRARY</span>
          <h2 id="library-title">A starting point for the next question.</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close mission library"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="small muted">
        Presets are representative studies, not official mission parameters.
        Loading one updates the form; it never starts a search automatically.
      </p>
      <div className="preset-grid">
        {MISSION_PRESETS.map((preset) => (
          <article key={preset.id}>
            <Icon
              name={
                preset.id === "solar"
                  ? "sun"
                  : preset.id === "contact"
                    ? "earth"
                    : "compass"
              }
            />
            <h3>{preset.name}</h3>
            <p>{preset.description}</p>
            <button
              className="text-button"
              disabled={
                loading || (preset.id === "science" && !scienceAvailable)
              }
              onClick={() => void load(preset.request)}
            >
              Load preset
              <Icon name="arrow" size={14} />
            </button>
          </article>
        ))}
      </div>
      <div className="section-heading">
        <h3>Saved in this browser</h3>
        <span className="small muted">{saved.length}/12</span>
      </div>
      <p className="field-hint">
        Only mission inputs are stored. No account, cloud sync, or saved
        scientific results.
      </p>
      <div className="save-mission-row">
        <label className="field">
          Mission name
          <input
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          className="secondary-button"
          disabled={!name.trim() || saved.length >= 12}
          onClick={() => {
            if (
              persist([
                {
                  id: crypto.randomUUID(),
                  name: name.trim(),
                  saved_utc: new Date().toISOString(),
                  request: structuredClone(value),
                },
                ...saved,
              ])
            )
              setNotice("Current mission inputs saved in this browser.");
          }}
        >
          <Icon name="pin" size={15} />
          Save current inputs
        </button>
      </div>
      {!saved.length ? (
        <p className="small muted">No saved missions yet.</p>
      ) : (
        <div className="saved-missions">
          {saved.map((mission) => (
            <article key={mission.id}>
              <div>
                <strong>{mission.name}</strong>
                <span>
                  {utcDate(mission.request.time_range.start_utc)} →{" "}
                  {utcDate(mission.request.time_range.end_utc)} · UTC
                </span>
              </div>
              <button
                className="text-button"
                disabled={loading}
                onClick={() => void load(mission.request)}
              >
                Load
              </button>
              <button
                className="icon-button"
                aria-label={`Export ${mission.name}`}
                onClick={() =>
                  downloadJson(
                    { name: mission.name, request: mission.request },
                    `lumen-mission-${mission.id}.json`,
                  )
                }
              >
                <Icon name="download" size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Delete ${mission.name}`}
                onClick={() =>
                  persist(saved.filter((item) => item.id !== mission.id))
                }
              >
                <Icon name="close" size={15} />
              </button>
            </article>
          ))}
        </div>
      )}
      {notice && (
        <p className="success-note" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <button
          className="secondary-button"
          onClick={() =>
            downloadJson(
              { schema_version: "lumen-mission-1", request: value },
              "lumen-mission.json",
            )
          }
        >
          <Icon name="download" size={15} />
          Export current configuration
        </button>
        <button
          className="secondary-button"
          disabled={loading}
          onClick={() => file.current?.click()}
        >
          Import configuration or report
        </button>
        <input
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          ref={file}
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
      </div>
    </dialog>
  );
}
