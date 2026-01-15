import { type FC, useState } from "react";
import { CodeBlock } from "./CodeBlock";
import { CollapsibleCode } from "./CollapsibleCode";
import { FileTree } from "./FileTree";

interface FileEntry {
  skillName: string;
  filename: string;
  content: string;
  language: string;
}

interface UtilEntry {
  filename: string;
  content: string;
}

interface InstallationTabsProps {
  domain: string;
  installCmd: string;
  skills: Array<{
    name: string;
    files?: {
      entry?: Record<string, string>;
    };
  }>;
  fileEntries: FileEntry[];
  utilEntries: UtilEntry[];
  depKeys: string[];
  envVars: string[];
}

export const InstallationTabs: FC<InstallationTabsProps> = ({
  domain,
  installCmd,
  skills,
  fileEntries,
  utilEntries,
  depKeys,
  envVars,
}) => {
  const [activeTab, setActiveTab] = useState<"cli" | "manual">("cli");

  // Group files by skill
  const skillNames = [...new Set(fileEntries.map((f) => f.skillName))];

  return (
    <div>
      {/* Tab buttons */}
      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setActiveTab("cli")}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === "cli"
              ? "bg-gray-900 text-white"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          CLI
        </button>
        <button
          onClick={() => setActiveTab("manual")}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === "manual"
              ? "bg-gray-900 text-white"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Manual
        </button>
      </div>

      {/* CLI content */}
      {activeTab === "cli" && (
        <div className="space-y-4">
          <CodeBlock code={installCmd} copyMode="hover" />
          
          <div className="text-sm text-gray-600 space-y-2">
            <p className="text-gray-400"># Or install specific subsets:</p>
            <CodeBlock code={`bunx @bind/skillz add ${domain}-*-read`} copyMode="hover" />
            <CodeBlock code={`bunx @bind/skillz add ${skills[0]?.name || domain}`} copyMode="hover" />
          </div>
        </div>
      )}

      {/* Manual content */}
      {activeTab === "manual" && (
        <div className="space-y-6">
          {/* Dependencies - at the top */}
          {depKeys.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Dependencies</h4>
              <p className="text-xs text-gray-500 mb-2">
                The CLI adds these automatically. For manual install, run:
              </p>
              <CodeBlock code={`bun add ${depKeys.join(" ")}`} copyMode="hover" />
            </div>
          )}

          {/* Interactive file tree */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Folder Structure</h4>
            <FileTree skills={skills} domain={domain} />
          </div>

          {/* File contents */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">File Contents</h4>
          </div>

          {/* Shared Utils - shown first with badge */}
          {utilEntries.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <code className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                  .opencode/utils/
                </code>
                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  shared
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Shared utilities used by all {domain} skills. Install once.
              </p>
              <div className="space-y-2">
                {utilEntries.map((util) => (
                  <CollapsibleCode
                    key={util.filename}
                    filename={util.filename}
                    code={util.content}
                    language="typescript"
                    defaultOpen={false}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Per-skill files */}
          {skillNames.map((skillName) => {
            const skillFiles = fileEntries.filter((f) => f.skillName === skillName);
            return (
              <div key={skillName}>
                <code className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded mb-3 inline-block">
                  .opencode/skill/{skillName}/
                </code>
                <div className="space-y-2 mt-3">
                  {skillFiles.map((file) => (
                    <CollapsibleCode
                      key={`${skillName}-${file.filename}`}
                      filename={file.filename}
                      code={file.content}
                      language={file.language}
                      defaultOpen={false}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Env vars reminder */}
          {envVars.length > 0 && (
            <div className="text-xs text-gray-500">
              Don't forget to set environment variables: <code className="bg-gray-100 px-1 rounded">{envVars.join(", ")}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
