import { startTransition, type FormEvent } from "react";

/**
 * React מאפס טופס אחרי כל שליחה דרך action — גם כשחזרה שגיאה, ואז המשתמש מאבד את מה שהקליד.
 * שליחה דרך onSubmit שומרת את הערכים; איפוס אחרי הצלחה נעשה במפורש במקום שצריך.
 */
export function submitKeepingValues(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
}
