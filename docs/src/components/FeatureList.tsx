import { Crosshair, FolderGit2, Layers } from "lucide-react";
import type { FC } from "react";

const features = [
  {
    icon: Crosshair,
    title: "Granular",
    description: "Each skill does one thing well",
  },
  {
    icon: FolderGit2,
    title: "Owned",
    description: "Lives in your repo, fully editable",
  },
  {
    icon: Layers,
    title: "Composable",
    description: "Combine for emergent capability",
  },
];

export const FeatureList: FC = () => {
  return (
    <ul className="flex flex-col gap-6">
      {features.map(({ icon: Icon, title, description }) => (
        <li key={title} className="flex items-center gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <Icon className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{title}</p>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
};
