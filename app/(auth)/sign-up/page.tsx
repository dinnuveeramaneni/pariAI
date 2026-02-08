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

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
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

    const register = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!register.ok) {
      const payload = (await register.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(payload?.error ?? "Unable to register");
      setIsLoading(false);
      return;
    }

    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    router.push("/projects");
    router.refresh();
  };

  return (
    <div className="mx-auto mt-10 max-w-md">
      <Card className="space-y-4">
        <header>
          <h1 className="text-xl font-semibold text-slate-900">
            Create account
          </h1>
          <p className="text-sm text-slate-500">
            Start building your team workspace.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm text-slate-700">Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
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
            {isLoading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="text-sm text-slate-600">
          Already have an account?{" "}
          <Link className="text-slate-900 underline" href="/sign-in">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
