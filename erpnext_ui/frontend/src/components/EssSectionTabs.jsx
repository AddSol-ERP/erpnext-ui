import { Children, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHeader } from "../context/HeaderContext";
import { focusFirstError } from "../lib/formValidation";
import { FormFeedbackContext } from "./FormField/feedbackContext";

/** Tab navigation for the existing ESS sections, keeping their form logic intact. */
export default function EssSectionTabs({ children, fieldErrors = {}, fieldTabs = {} }) {
  const sections = Children.toArray(children);
  const [active, setActive] = useState("0");
  const { setShellMode } = useHeader();
  useEffect(() => {
    setShellMode?.("tabbed-form");
    return () => setShellMode?.("default");
  }, [setShellMode]);
  useEffect(() => {
    const field = Object.keys(fieldErrors).find((key) => fieldErrors[key]);
    if (!field || fieldTabs[field] == null) return undefined;
    // Open the relevant section before moving focus to its field.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(String(fieldTabs[field]));
    const frame = requestAnimationFrame(() => focusFirstError(fieldErrors));
    return () => cancelAnimationFrame(frame);
  }, [fieldErrors, fieldTabs]);
  return <Tabs value={active} onValueChange={setActive} className="min-h-0 flex-1 gap-0 overflow-hidden bg-card">
    <TabsList className="h-auto w-full shrink-0 justify-start gap-0 overflow-x-auto rounded-none border-b border-border/60 bg-card p-0">
      {sections.map((section, index) => <TabsTrigger key={index} value={String(index)} className="min-h-9 flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-1 text-xs text-muted-foreground shadow-none after:hidden data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{section.props.title}</TabsTrigger>)}
    </TabsList>
    {sections.map((section, index) => <TabsContent key={index} value={String(index)} className="m-0 min-h-0 overflow-y-auto overscroll-contain p-0"><FormFeedbackContext.Provider value={TOAST_FEEDBACK}>{section}</FormFeedbackContext.Provider></TabsContent>)}
  </Tabs>;
}

const TOAST_FEEDBACK = { toastOnly: true };
