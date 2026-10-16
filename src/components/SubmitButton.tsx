'use client';

import { useFormStatus } from 'react-dom';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { confirmText?: string };

// A submit button that disables itself while the form is saving, with an optional "are you sure?".
export function SubmitButton({ children, confirmText, className = 'btn', onClick, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending || rest.disabled}
      onClick={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
