"use client";

import { useEffect, useState } from "react";
import {
  ArrowPathIcon,
  ArrowRightStartOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dumpd/ui/components/dropdown-menu";
import { cn } from "@dumpd/ui/lib/utils";

import { authClient } from "@/lib/auth-client";

import { AiChatWorkspace } from "./ai-chat-workspace";
import { Login } from "./login";
import { ThemeSwitcher } from "./theme-switcher";

type SessionUser = {
  email?: string | null;
  image?: string | null;
  name?: string | null;
};

type ThemeMode = "system" | "light" | "dark";

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "U";
  const parts = source.split(/\s+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function UserAvatar({
  user,
  className,
}: {
  user?: SessionUser;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageSrc = user?.image?.trim();

  useEffect(() => {
    setImageFailed(false);
  }, [imageSrc]);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden",
        className,
      )}
      aria-hidden={!user}
    >
      {imageSrc && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={user?.name || user?.email || "User avatar"}
          className="block size-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        getInitials(user?.name, user?.email)
      )}
    </div>
  );
}

export function HomeSessionDock() {
  const { data: session, isPending } = authClient.useSession();
  const { setTheme, theme } = useTheme();
  const user = (session as { user?: SessionUser } | null)?.user;
  const selectedTheme: ThemeMode =
    theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : "system";
  async function handleSignOut() {
    await authClient.signOut();
  }

  return (
    <>
      <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-20 flex items-center gap-2 md:right-4 md:top-4">
        <ThemeSwitcher value={selectedTheme} onChange={setTheme} />
        {session ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="mt-1 flex size-10 cursor-pointer items-center justify-center rounded-full border border-border bg-card p-1 shadow-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:size-9">
              <UserAvatar
                user={user}
                className="size-8 rounded-full bg-muted text-center text-[10px] font-medium text-foreground"
              />
              <span className="sr-only">Open user menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={10} className="w-72 rounded-3xl p-0">
              <div className="flex items-center gap-3 p-4">
                <UserAvatar
                  user={user}
                  className="size-14 rounded-full bg-muted text-sm font-medium text-foreground"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">
                    {user?.name || "User"}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {user?.email || ""}
                  </p>
                </div>
              </div>
              <DropdownMenuSeparator className="my-0" />
              <DropdownMenuGroup className="p-1">
                <DropdownMenuItem
                  variant="destructive"
                  className="cursor-pointer rounded-2xl"
                  onClick={handleSignOut}
                >
                  <ArrowRightStartOnRectangleIcon />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {session ? <AiChatWorkspace /> : null}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-20 flex justify-center px-3 md:bottom-6 md:px-4">
        {isPending ? (
          <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 shadow-sm">
            <ArrowPathIcon className="size-3.5 animate-spin" />
            <span className="text-xs text-muted-foreground">Loading session</span>
          </div>
        ) : !session ? (
          <div className="pointer-events-auto">
            <Login />
          </div>
        ) : null}
      </div>
    </>
  );
}
