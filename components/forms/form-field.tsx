import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function TextField({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  return (
    <div>
      <Label htmlFor={props.name}>
        {label}
        {props.required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      <Input id={props.name} {...props} />
      {hint ? <p className="mt-1.5 text-xs leading-5 text-[var(--muted-foreground)]">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  label,
  children,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={props.name}>
        {label}
        {props.required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      <select
        className={cn(
          "h-11 w-full rounded-md border border-[var(--border-strong)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
          className,
        )}
        id={props.name}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function TextareaField({ label, hint, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode }) {
  return (
    <div>
      <Label htmlFor={props.name}>
        {label}
        {props.required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      <Textarea id={props.name} {...props} />
      {hint ? <p className="mt-1.5 text-xs leading-5 text-[var(--muted-foreground)]">{hint}</p> : null}
    </div>
  );
}
