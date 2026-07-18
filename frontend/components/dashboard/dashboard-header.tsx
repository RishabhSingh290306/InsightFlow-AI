"use client";

import Link from "next/link";
import { Bell, ChevronDown, LogOut, Settings, Sparkles, User } from "lucide-react";

import {
  Dropdown,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
} from "@/components/ui/dropdown";
import { timeAgo, type ActivityItem } from "@/components/dashboard/activity-timeline";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "IF";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function DashboardHeader({
  userName,
  onSignOut,
  notifications,
}: {
  userName: string;
  onSignOut: () => void;
  notifications: ActivityItem[];
}) {
  const hasNotifications = notifications.length > 0;
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-soft-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          InsightFlow
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Notifications */}
          <Dropdown
            align="right"
            trigger={
              <button
                type="button"
                aria-label="Notifications"
                className="relative flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Bell className="h-4 w-4" />
                {hasNotifications && (
                  <span className="absolute right-2.5 top-2.5 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                )}
              </button>
            }
          >
            <div className="w-72 p-1">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Notifications
                </span>
                {hasNotifications && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
                    {notifications.length}
                  </span>
                )}
              </div>
              <DropdownSeparator />
              {!hasNotifications ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  You&apos;re all caught up.
                </p>
              ) : (
                <ul className="max-h-72 overflow-y-auto">
                  {notifications.slice(0, 6).map((n) => (
                    <li
                      key={n.key}
                      className="flex items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{n.label}</p>
                        <p className="text-2xs text-muted-foreground">{timeAgo(n.time)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Dropdown>

          {/* User menu */}
          <Dropdown
            align="right"
            trigger={
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 py-1 pl-1 pr-2 text-sm shadow-soft-sm transition-all duration-200 hover:border-primary/30 hover:shadow-soft-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Account menu"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-deep text-2xs font-semibold text-primary-foreground">
                  {initialsOf(userName)}
                </span>
                <span className="hidden max-w-[8rem] truncate font-medium sm:inline">
                  {userName}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            }
          >
            <DropdownLabel>{userName}</DropdownLabel>
            <DropdownSeparator />
            <DropdownItem icon={<User className="h-4 w-4" />}>Profile</DropdownItem>
            <DropdownItem icon={<Settings className="h-4 w-4" />}>Settings</DropdownItem>
            <DropdownSeparator />
            <DropdownItem
              icon={<LogOut className="h-4 w-4" />}
              onClick={onSignOut}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Sign out
            </DropdownItem>
          </Dropdown>
        </div>
      </div>
    </header>
  );
}
