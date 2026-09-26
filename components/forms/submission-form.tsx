"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";

import { trackAnalyticsEvent } from "@/lib/analytics/events";
import type { FormRouteKind } from "@/lib/forms/types";
import { publisher, retention } from "@/lib/legal";

import { SelectField, TextareaField, TextField } from "@/components/forms/form-field";
import { LegalText } from "@/components/legal/legal-document";
import { Button } from "@/components/ui/button";

const formTitles: Record<FormRouteKind, string> = {
  "founding-member": "Founding member",
  pilot: "Pilot partner",
  "technical-contributor": "Technical contributor",
  "financial-patron": "Financial patron",
  contact: "General inquiry",
};

function CommonFields({ requireOrganization = false, includeRole = false }: { requireOrganization?: boolean; includeRole?: boolean }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <TextField autoComplete="name" label="Your name" name="contactName" required />
      <TextField autoComplete="email" label="Work email" name="email" required type="email" />
      {requireOrganization ? (
        <TextField autoComplete="organization" label="Organisation" name="organization" required />
      ) : (
        <TextField autoComplete="organization" label="Organisation (optional)" name="organization" />
      )}
      {includeRole ? <TextField label="Your role" name="role" placeholder="e.g. Operations director" required /> : null}
      <TextField autoComplete="country-name" label="Country" name="country" required />
    </div>
  );
}

// Option values stay as first published so that earlier submissions remain comparable; only the visible wording is plain.
function FoundingFields() {
  return (
    <>
      <CommonFields includeRole requireOrganization />
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <TextField label="Organisation website (optional)" name="website" type="url" />
        <SelectField label="Type of organisation" name="actorType" required>
          <option value="">Select one</option>
          <option value="Operator">Hotel or hotel group</option>
          <option value="PMS provider">PMS vendor</option>
          <option value="Software vendor">Hotel software vendor</option>
          <option value="Integrator">Integrator</option>
          <option value="Developer organisation">Software development firm</option>
          <option value="Other hospitality stakeholder">Other hospitality organisation</option>
        </SelectField>
        <TextField label="What interests you most in HOS?" name="interestArea" placeholder="e.g. fewer surprises at arrival" required />
        <SelectField label="How involved would you like to be?" name="engagementLevel" required>
          <option value="">Select one</option>
          <option value="Explore founding participation">I would like to learn more first</option>
          <option value="Ready to discuss a contribution">Ready to discuss a contribution</option>
          <option value="Interested in a working group">Interested in a working group</option>
        </SelectField>
      </div>
      <fieldset className="mt-6">
        <legend className="mb-2 text-sm font-medium">Which systems are you involved with? *</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {[
            ["PMS", "PMS"],
            ["Housekeeping", "Housekeeping"],
            ["Guest messaging", "Guest messaging"],
            ["Integration platform", "Integration platform"],
            ["Agent tooling", "AI agents or assistants"],
          ].map(([value, label]) => (
            <label className="inline-flex items-center gap-2" key={value}>
              <input name="systemCategories" type="checkbox" value={value} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-6">
        <legend className="mb-2 text-sm font-medium">Could your organisation later name one business contact and one technical contact? *</legend>
        <div className="flex gap-5 text-sm">
          <label className="inline-flex items-center gap-2">
            <input name="futureRepresentatives" required type="radio" value="yes" />
            Yes
          </label>
          <label className="inline-flex items-center gap-2">
            <input name="futureRepresentatives" type="radio" value="not_yet" />
            Not yet
          </label>
        </div>
      </fieldset>
    </>
  );
}

function PilotFields() {
  return (
    <>
      <CommonFields requireOrganization />
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <TextField label="Number of hotels involved (approximate)" name="propertyCount" placeholder="e.g. 8–15" required />
        <TextField label="PMS" name="pms" placeholder="e.g. Mews, Apaleo, or your own" required />
        <TextField label="Housekeeping tool (optional)" name="housekeepingTool" />
        <TextField label="Guest messaging tool (optional)" name="messagingTool" />
        <TextField label="Role of the business contact" name="businessRole" placeholder="e.g. Operations director" required />
        <TextField label="Role of the technical contact" name="technicalRole" placeholder="e.g. IT manager" required />
      </div>
      <TextareaField
        className="mt-5"
        hint="For example: early arrivals when rooms are not ready. Do not share passwords, guest data, exports or confidential business information."
        label="Which arrival situation would you like to test?"
        name="arrivalScenario"
        required
      />
      <fieldset className="mt-6">
        <legend className="mb-2 text-sm font-medium">
          Could you get authorised access to these systems, with the agreement of the company that runs them? *
        </legend>
        <div className="flex gap-5 text-sm">
          <label className="inline-flex items-center gap-2">
            <input name="apiAccess" required type="radio" value="yes" />
            Yes
          </label>
          <label className="inline-flex items-center gap-2">
            <input name="apiAccess" type="radio" value="not_yet" />
            Not yet
          </label>
        </div>
      </fieldset>
    </>
  );
}

function TechnicalFields() {
  return (
    <>
      <CommonFields />
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <TextField hint="Optional; no account connection is requested." label="GitHub handle (optional)" name="githubHandle" />
        <SelectField label="What would you like to work on?" name="contributionDomain" required>
          <option value="">Select one</option>
          <option value="Core">Core data model</option>
          <option value="Schemas">Schemas</option>
          <option value="Mapping">PMS mappings</option>
          <option value="SDK">SDKs</option>
          <option value="Tests">Tests</option>
          <option value="Documentation">Documentation</option>
        </SelectField>
      </div>
    </>
  );
}

function PatronFields() {
  return (
    <>
      <CommonFields />
      <SelectField className="mt-5" label="Who would provide the support?" name="supporterCategory" required>
        <option value="">Select one</option>
        <option value="individual">An individual</option>
        <option value="company">A company</option>
        <option value="institution">An institution</option>
      </SelectField>
    </>
  );
}

function SpecificFields({ kind }: { kind: FormRouteKind }) {
  if (kind === "founding-member") return <FoundingFields />;
  if (kind === "pilot") return <PilotFields />;
  if (kind === "technical-contributor") return <TechnicalFields />;
  if (kind === "financial-patron") return <PatronFields />;
  return <CommonFields />;
}

export function SubmissionForm({ kind }: { kind: FormRouteKind }) {
  const enhanced = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [step, setStep] = useState(1);
  const started = useRef(false);
  const firstStep = useRef<HTMLElement>(null);
  const hasTwoSteps = kind !== "contact";

  function markStarted() {
    if (!started.current) {
      trackAnalyticsEvent("form_started");
      started.current = true;
    }
  }

  function moveToSecondStep() {
    const controls = firstStep.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea") ?? [];
    for (const control of controls) {
      if (!control.checkValidity()) {
        control.reportValidity();
        return;
      }
    }
    setStep(2);
  }

  return (
    <form
      action={`/api/forms/${kind}`}
      className="space-y-7"
      method="post"
      onFocusCapture={markStarted}
      onSubmit={() => trackAnalyticsEvent("form_submitted")}
    >
      <input
        aria-hidden="true"
        className="absolute -left-[10000px] h-px w-px overflow-hidden opacity-0"
        name="websiteTrap"
        tabIndex={-1}
        type="text"
        autoComplete="off"
      />
      <input name="turnstileToken" type="hidden" value="" readOnly />
      <input name="formTitle" type="hidden" value={formTitles[kind]} readOnly />
      <section hidden={enhanced && hasTwoSteps && step !== 1} ref={firstStep}>
        {enhanced && hasTwoSteps ? <p className="eyebrow mb-5">Step 1 of 2 · About you</p> : null}
        <SpecificFields kind={kind} />
      </section>
      <section hidden={enhanced && hasTwoSteps && step !== 2}>
        {enhanced && hasTwoSteps ? <p className="eyebrow mb-5">Step 2 of 2 · Your request</p> : null}
        <TextareaField
          hint="Please do not include guest data, credentials, API keys, exports or confidential commercial information."
          label={kind === "contact" ? "Your message" : "In a few lines, what would you like to do with HOS?"}
          name="context"
          required
        />
        <label className="mt-5 flex gap-3 text-sm leading-6">
          <input className="mt-1" name="privacyAccepted" required type="checkbox" />
          <span>
            This form is for professional contact only, and I have read the{" "}
            <a className="text-[var(--accent)] underline" href="/privacy">
              privacy notice
            </a>
            .
          </span>
        </label>
        <p className="mt-4 text-xs leading-5 text-[var(--muted-foreground)]">
          <LegalText value={publisher.name} /> uses this information only to assess and answer your request, and deletes it{" "}
          {retention.submissionMonths} months after our last exchange. You can access, correct or delete it, or object, at any time: see the{" "}
          <a className="text-[var(--accent)] underline" href="/privacy#rights">
            privacy notice
          </a>
          .
        </p>
      </section>
      {enhanced && hasTwoSteps && step === 1 ? (
        <Button onClick={moveToSecondStep} type="button">
          Continue <ArrowRight aria-hidden="true" size={16} />
        </Button>
      ) : (
        <div className="flex flex-wrap gap-3">
          {enhanced && hasTwoSteps ? (
            <Button onClick={() => setStep(1)} type="button" variant="secondary">
              <ArrowLeft aria-hidden="true" size={16} />
              Back
            </Button>
          ) : null}
          <Button type="submit">
            Send <Check aria-hidden="true" size={16} />
          </Button>
        </div>
      )}
    </form>
  );
}
