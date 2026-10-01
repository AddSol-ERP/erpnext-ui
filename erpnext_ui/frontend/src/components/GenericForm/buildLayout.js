/**
 * Pure form layout builder for GenericForm.
 *
 * Hierarchy: Tab Break → tab → Section Break → section → fields.
 * Fields before the first break land in an implicit section under an
 * implicit tab so nothing is dropped.
 *
 * Modes: "single" | "tabs" | "stepper"
 *  - config.form.layout always wins when set
 *  - auto: simple forms stay single; Tab Breaks → tabs; large forms → stepper
 */

export const SKIP_FIELDTYPES = [
  "Section Break",
  "Column Break",
  "Tab Break",
  "Fold",
  "Page Break",
];

export const SYSTEM_FIELDS = [
  "name",
  "owner",
  "creation",
  "modified",
  "modified_by",
  "idx",
  "docstatus",
  "amended_from",
  "amended_by",
  "_user_tags",
  "_comments",
  "_assign",
  "_liked_by",
  "doctype",
];

function countFields(tabs) {
  let n = 0;
  tabs.forEach((tab) => {
    tab.sections.forEach((section) => {
      n += section.fields.length;
    });
  });
  return n;
}

function countSections(tabs) {
  return tabs.reduce((sum, tab) => sum + tab.sections.length, 0);
}

/**
 * Walk raw DocType fields into tabs → sections → fields.
 * Always returns at least one tab (may be empty sections filtered out later).
 */
export function buildLayoutTree(fields = []) {
  const tabs = [];
  let currentTab = null;
  let currentSection = null;

  const ensureTab = (label = "", description = "") => {
    currentTab = {
      id: `tab-${tabs.length}`,
      label,
      description,
      sections: [],
    };
    tabs.push(currentTab);
    currentSection = null;
    return currentTab;
  };

  const ensureSection = (label = "", description = "") => {
    if (!currentTab) ensureTab();
    currentSection = { label, description, fields: [] };
    currentTab.sections.push(currentSection);
    return currentSection;
  };

  fields.forEach((field) => {
    const ft = field.fieldtype;

    if (ft === "Tab Break") {
      // New tab only — Section Breaks under it become the tab's sections.
      ensureTab(field.label || "", field.description || "");
      return;
    }

    if (ft === "Section Break") {
      ensureSection(field.label || "", field.description || "");
      return;
    }

    if (SKIP_FIELDTYPES.includes(ft)) return;
    if (SYSTEM_FIELDS.includes(field.fieldname) || !field.fieldname) return;

    // Fields before any break → implicit section/tab
    if (!currentSection) {
      ensureSection();
    }

    if (field.hidden) return;
    currentSection.fields.push(field);
  });

  // Drop empty sections / tabs
  const visibleTabs = tabs
    .map((tab) => ({
      ...tab,
      sections: tab.sections.filter((s) => s.fields.length > 0),
    }))
    .filter((tab) => tab.sections.length > 0);

  return visibleTabs;
}

/**
 * Auto-select layout mode (config override applied by caller before this).
 */
export function resolveLayoutMode(fields = [], explicit) {
  if (explicit === "single" || explicit === "tabs" || explicit === "stepper") {
    return explicit;
  }

  const tabs = buildLayoutTree(fields);
  const fieldCount = countFields(tabs);
  const sectionCount = countSections(tabs);
  const tabCount = tabs.length;
  const hasTabBreak =
    fields.some((f) => f.fieldtype === "Tab Break") && tabCount > 1;

  if (fieldCount <= 12 && sectionCount <= 2 && !hasTabBreak) {
    return "single";
  }

  if (fieldCount > 30 || sectionCount >= 5 || tabCount > 5) {
    // Prefer tabs when structure is clearly tabbed and not huge
    if (hasTabBreak && tabCount <= 5 && fieldCount <= 40) {
      return "tabs";
    }
    return "stepper";
  }

  if (hasTabBreak) return "tabs";
  if (sectionCount >= 3 && fieldCount > 12) return "tabs";
  return "single";
}

/**
 * Stepper steps from layout tree:
 *  - Tab Breaks present → one step per tab
 *  - else one step per section, merging tiny sections up to ~10 fields
 *  - Table fields always stay in one step
 */
export function buildSteps(tabs = []) {
  if (tabs.length > 1) {
    return tabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      description: tab.description,
      sections: tab.sections,
      fields: tab.sections.flatMap((s) => s.fields),
    }));
  }

  const sections = tabs[0]?.sections || [];
  const steps = [];
  let bucket = null;
  const MAX = 12;

  const flush = () => {
    if (bucket && bucket.sections.length) steps.push(bucket);
    bucket = null;
  };

  sections.forEach((section, i) => {
    const isTableOnly =
      section.fields.length === 1 && section.fields[0].fieldtype === "Table";
    const sectionCount = section.fields.length;
    const currentCount = bucket ? bucket.fields.length : 0;

    if (!bucket) {
      bucket = {
        id: `step-${steps.length}`,
        label: section.label,
        description: section.description,
        sections: [section],
        fields: [...section.fields],
      };
      if (isTableOnly || sectionCount >= MAX) flush();
      return;
    }

    if (isTableOnly || currentCount + sectionCount > MAX) {
      flush();
      bucket = {
        id: `step-${steps.length}`,
        label: section.label,
        description: section.description,
        sections: [section],
        fields: [...section.fields],
      };
      if (isTableOnly || sectionCount >= MAX) flush();
      return;
    }

    bucket.sections.push(section);
    bucket.fields.push(...section.fields);
    if (i === sections.length - 1) flush();
  });

  flush();

  if (!steps.length) {
    steps.push({
      id: "step-0",
      label: "",
      description: "",
      sections: [],
      fields: [],
    });
  }

  return steps;
}

/** All fieldnames belonging to a set of sections. */
export function sectionFieldNames(sections = []) {
  return sections.flatMap((s) => s.fields.map((f) => f.fieldname));
}

/** Index of the tab/step that contains `fieldname` (or 0). */
export function findGroupIndexForField(groups = [], fieldname) {
  for (let i = 0; i < groups.length; i++) {
    const names = groups[i].fields
      ? groups[i].fields.map((f) => f.fieldname)
      : sectionFieldNames(groups[i].sections || []);
    if (names.includes(fieldname)) return i;
  }
  return 0;
}
