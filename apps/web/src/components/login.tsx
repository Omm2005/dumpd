"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@dumpd/ui/components/button";

import { authClient } from "@/lib/auth-client";

function GoogleLogo() {
  return (
    <svg aria-hidden="true" data-icon="inline-start" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.64 12.2c0-.82-.07-1.62-.21-2.38H12v4.5h6.53a5.58 5.58 0 0 1-2.42 3.66v2.99h3.92c2.29-2.11 3.61-5.22 3.61-8.77z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.92-2.99c-1.09.73-2.47 1.16-4.03 1.16-3.1 0-5.73-2.09-6.67-4.9H1.28v3.08A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.33 14.36a7.2 7.2 0 0 1 0-4.72V6.56H1.28a12 12 0 0 0 0 10.88l4.05-3.08z"
      />
      <path
        fill="#EA4335"
        d="M12 4.74c1.76 0 3.34.61 4.59 1.8l3.47-3.47A11.76 11.76 0 0 0 12 0 12 12 0 0 0 1.28 6.56l4.05 3.08c.94-2.81 3.57-4.9 6.67-4.9z"
      />
    </svg>
  );
}

export function Login() {
  const [isStartingGoogle, setIsStartingGoogle] = useState(false);
  const { data: session, isPending } = authClient.useSession();

  if (session) {
    return null;
  }

  async function continueWithGoogle() {
    setIsStartingGoogle(true);

    await authClient.signIn.social(
      {
        provider: "google",
        callbackURL: "/",
      },
      {
        onError: (error) => {
          toast.error(error.error.message || error.error.statusText);
          setIsStartingGoogle(false);
        },
      },
    );
  }

  return (
    <Button
      size="lg"
      className="cursor-pointer"
      onClick={continueWithGoogle}
      disabled={isPending || isStartingGoogle}
    >
      {isPending || isStartingGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleLogo />}
      {isPending ? "Loading session" : isStartingGoogle ? "Opening Google..." : "Continue with Google"}
    </Button>
  );
}
