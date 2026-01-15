import { type FC, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileText } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { CollapsibleCode } from "./CollapsibleCode";

interface FileEntry {
  filename: string;
  content: string;
  language: string;
}

interface UtilEntry {
  filename: string;
  content: string;
}

interface SkillInstallationTabsProps {
  skillName: string;
  installCmd: string;
  fileEntries: FileEntry[];
  utilEntries: UtilEntry[];
  depKeys: string[];
  envVars: string[];
}

// Simple file tree for a single skill
const SkillFileTree: FC<{ skillName: string; files: string[]; utils: string[] }> = ({
  skillName,
  files,
  utils,
}) => {
  const [skillOpen, setSkillOpen] = useState(true);
  const [skillNameOpen, setSkillNameOpen] = useState(true);
  const [utilsOpen, setUtilsOpen] = useState(true);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-sm overflow-x-auto">
      {/* .opencode folder */}
      <div className="flex items-center gap-2 py-0.5 text-gray-700">
        <ChevronDown className="w-4 h-4 text-gray-500" />
        <FolderOpen className="w-4 h-4 text-gray-500" />
        <span className="font-medium">.opencode</span>
      </div>

      {/* skill folder - indent level 1 */}
      <div style={{ marginLeft: "16px" }}>
        <button
          onClick={() => setSkillOpen(!skillOpen)}
          className="flex items-center gap-2 py-0.5 w-full text-left hover:bg-gray-100 rounded transition-colors text-gray-700"
        >
          {skillOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          {skillOpen ? (
            <FolderOpen className="w-4 h-4 text-gray-500" />
          ) : (
            <Folder className="w-4 h-4 text-gray-500" />
          )}
          <span className="font-medium">skill</span>
        </button>

        {skillOpen && (
          <>
            {/* skill name folder - indent level 2 */}
            <div style={{ marginLeft: "16px" }}>
              <button
                onClick={() => setSkillNameOpen(!skillNameOpen)}
                className="flex items-center gap-2 py-0.5 w-full text-left hover:bg-gray-100 rounded transition-colors text-gray-700"
              >
                {skillNameOpen ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
                {skillNameOpen ? (
                  <FolderOpen className="w-4 h-4 text-gray-500" />
                ) : (
                  <Folder className="w-4 h-4 text-gray-500" />
                )}
                <span className="font-medium">{skillName}</span>
              </button>

              {/* files - indent level 3 */}
              {skillNameOpen && (
                <div style={{ marginLeft: "16px" }}>
                  {files.map((file) => (
                    <div key={file} className="flex items-center gap-2 py-0.5 text-gray-600" style={{ marginLeft: "8px" }}>
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span>{file}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* utils folder - indent level 1 (sibling of skill) */}
      {utils.length > 0 && (
        <div style={{ marginLeft: "16px" }}>
          <button
            onClick={() => setUtilsOpen(!utilsOpen)}
            className="flex items-center gap-2 py-0.5 w-full text-left hover:bg-gray-100 rounded transition-colors text-gray-700"
          >
            {utilsOpen ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
            {utilsOpen ? (
              <FolderOpen className="w-4 h-4 text-gray-500" />
            ) : (
              <Folder className="w-4 h-4 text-gray-500" />
            )}
            <span className="font-medium">utils</span>
          </button>

          {utilsOpen && (
            <div style={{ marginLeft: "24px" }}>
              {utils.map((file) => (
                <div key={file} className="flex items-center gap-2 py-0.5 text-gray-600">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span>{file}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const SkillInstallationTabs: FC<SkillInstallationTabsProps> = ({
  skillName,
  installCmd,
  fileEntries,
  utilEntries,
  depKeys,
  envVars,
}) => {
  const [activeTab, setActiveTab] = useState<"cli" | "manual">("cli");

  const fileNames = fileEntries.map((f) => f.filename);
  const utilNames = utilEntries.map((u) => u.filename);

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
        <div>
          <CodeBlock code={installCmd} copyMode="hover" />
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
            <SkillFileTree skillName={skillName} files={fileNames} utils={utilNames} />
          </div>

          {/* File contents */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">File Contents</h4>
          </div>

          {/* Skill files */}
          <div>
            <code className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded mb-3 inline-block">
              .opencode/skill/{skillName}/
            </code>
            <div className="space-y-2 mt-3">
              {fileEntries.map((file) => (
                <CollapsibleCode
                  key={file.filename}
                  filename={file.filename}
                  code={file.content}
                  language={file.language}
                  defaultOpen={false}
                />
              ))}
            </div>
          </div>

          {/* Shared Utils */}
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
