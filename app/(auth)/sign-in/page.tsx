"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

const BYPASS_SIGN_IN = process.env.NEXT_PUBLIC_AUTH_BYPASS === "1";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (BYPASS_SIGN_IN) {
      router.replace("/projects");
    }
  }, [router]);

  if (BYPASS_SIGN_IN) {
    return (
      <p className="text-sm text-slate-600">
        Bypass auth enabled. Redirecting...
      </p>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid credentials");
      setIsLoading(false);
      return;
    }

    router.push("/projects");
    router.refresh();
  };

  return (
    <div className="mx-auto mt-10 max-w-md">
      <Card className="space-y-4">
        <header>
          <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
          <p className="text-sm text-slate-500">
            Access your analytics workspace.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm text-slate-700">Email</span>
            <Input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-slate-700">Password</span>
            <Input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <Button disabled={isLoading} type="submit" className="w-full">
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        {process.env.NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH === "1" ? (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void signIn("google")}
          >
            Continue with Google
          </Button>
        ) : null}

        <p className="text-sm text-slate-600">
          No account?{" "}
          <Link className="text-slate-900 underline" href="/sign-up">
            Create one
          </Link>
        </p>
      </Card>
    </div>
  );
}
