import { type FC } from "react";
import { Icon } from "./Icon";
import { CopyButton } from "./CopyButton";

interface InstallCommandProps {
  command: string;
  label?: string;
  className?: string;
}

export const InstallCommand: FC<InstallCommandProps> = ({
  command,
  label = "Install",
  className = "",
}) => {
  return (
    <div className={className}>
      {label && (
        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-3">
          <Icon name="download" size="sm" />
          <span>{label}</span>
        </div>
      )}
      <div className="group relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-gray-400 to-gray-300 rounded-lg opacity-20 group-hover:opacity-40 transition-opacity duration-300" />
        <div className="relative flex items-center justify-between gap-4 p-4 rounded-lg border border-gray-200 bg-white backdrop-blur">
          <code className="text-base text-gray-800 font-mono">{command}</code>
          <CopyButton text={command} variant="button" />
        </div>
      </div>
    </div>
  );
};
