import { type FC, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileText } from "lucide-react";

interface TreeNode {
  name: string;
  type: "file" | "folder";
  children?: TreeNode[];
}

interface FileTreeProps {
  skills: Array<{
    name: string;
    files?: {
      entry?: Record<string, string>;
    };
  }>;
  domain: string;
}

interface FolderNodeProps {
  node: TreeNode;
  depth: number;
  defaultOpen?: boolean;
}

const FolderNode: FC<FolderNodeProps> = ({ node, depth, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const indent = depth * 16;

  if (node.type === "file") {
    return (
      <div
        className="flex items-center gap-2 py-0.5 text-gray-600"
        style={{ paddingLeft: `${indent}px` }}
      >
        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="text-sm">{node.name}</span>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 py-0.5 w-full text-left hover:bg-gray-100 rounded transition-colors text-gray-700"
        style={{ paddingLeft: `${indent}px` }}
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
        )}
        {isOpen ? (
          <FolderOpen className="w-4 h-4 text-gray-500 flex-shrink-0" />
        ) : (
          <Folder className="w-4 h-4 text-gray-500 flex-shrink-0" />
        )}
        <span className="text-sm font-medium">{node.name}</span>
      </button>
      {isOpen && node.children && (
        <div>
          {node.children.map((child, i) => (
            <FolderNode
              key={`${child.name}-${i}`}
              node={child}
              depth={depth + 1}
              defaultOpen={child.name === "skill" || child.name === "utils"}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileTree: FC<FileTreeProps> = ({ skills, domain }) => {
  // Build tree structure from skills data
  const tree: TreeNode = {
    name: ".opencode",
    type: "folder",
    children: [
      {
        name: "skill",
        type: "folder",
        children: skills.map((skill) => ({
          name: skill.name,
          type: "folder" as const,
          children: [
            { name: "SKILL.md", type: "file" as const },
            ...Object.keys(skill.files?.entry || {}).map((entry) => ({
              name: `${entry}.ts`,
              type: "file" as const,
            })),
          ],
        })),
      },
      {
        name: "utils",
        type: "folder",
        children: [{ name: `${domain}.ts`, type: "file" as const }],
      },
    ],
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono overflow-x-auto">
      <FolderNode node={tree} depth={0} defaultOpen={true} />
    </div>
  );
};
