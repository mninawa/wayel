export type OpsOverlayVariant = 'note' | 'dialog';
export type OpsToastTone = 'success' | 'error' | 'info';

export interface OpsPromptField {
  id: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  multiline?: boolean;
}

export interface OpsPromptOptions {
  title: string;
  message?: string;
  hint?: string;
  variant?: OpsOverlayVariant;
  fields: OpsPromptField[];
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface OpsPromptState extends OpsPromptOptions {
  fieldError: string | null;
  values: Record<string, string>;
  resolve: (value: Record<string, string> | null) => void;
}

export interface OpsToast {
  id: string;
  message: string;
  tone: OpsToastTone;
}
