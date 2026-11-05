import type { ProjectColor } from "@stt/shared";

type FilledColor = Exclude<ProjectColor, "default">;

const fillClasses: Record<FilledColor, string> = {
  gray: "bg-project-gray",
  brown: "bg-project-brown",
  orange: "bg-project-orange",
  yellow: "bg-project-yellow",
  green: "bg-project-green",
  blue: "bg-project-blue",
  purple: "bg-project-purple",
  pink: "bg-project-pink",
  red: "bg-project-red",
};

const OUTLINED_MARKER = "border border-line-strong";

const NEUTRAL_FILL = "bg-fg-faint";

export function markerClass(color: ProjectColor): string {
  return color === "default" ? OUTLINED_MARKER : fillClasses[color];
}

export function shareClass(color: ProjectColor | null): string {
  return color === null || color === "default" ? NEUTRAL_FILL : fillClasses[color];
}
