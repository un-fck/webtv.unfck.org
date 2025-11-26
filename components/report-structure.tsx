'use client';

import { useState, useEffect } from 'react';

interface TreeNode {
  level: number;
  title: string;
  children: TreeNode[];
  content: string[];
}

interface ReportStructureProps {
  data: TreeNode[];
}

type ExpandLevel = 'sections' | 'subsections' | 'details' | 'deeper' | 'full';

const levelDepthMap: Record<ExpandLevel, number> = {
  sections: 1,      // Level 1 only (main sections)
  subsections: 2,   // Up to level 2 (subsections)
  details: 3,       // Up to level 3 (sub-subsections)
  deeper: 4,        // Up to level 4
  full: Infinity,   // Everything including content
};

function ContentItem({ 
  paragraph, 
  indentLevel, 
  isFullMode 
}: { 
  paragraph: string; 
  indentLevel: number; 
  isFullMode: boolean;
}) {
  const isParagraph = paragraph.length > 150;
  const [textExpanded, setTextExpanded] = useState(isFullMode);
  
  useEffect(() => {
    setTextExpanded(isFullMode);
  }, [isFullMode]);
  
  const shouldShowFullText = !isParagraph || textExpanded || isFullMode;
  
  return (
    <div
      className="flex items-start gap-2 py-1.5 hover:bg-gray-50 text-gray-700"
      style={{ paddingLeft: `${indentLevel * 20}px` }}
    >
      <div className="flex-shrink-0 w-4"></div>
      <span 
        className={`flex-1 text-sm ${isParagraph ? 'cursor-pointer' : ''} ${
          shouldShowFullText ? '' : 'line-clamp-1'
        }`}
        onClick={(e) => {
          if (isParagraph) {
            e.stopPropagation();
            setTextExpanded(!textExpanded);
          }
        }}
      >
        {paragraph}
      </span>
    </div>
  );
}

function TreeItem({ 
  node, 
  expandToLevel,
  resetKey,
  isFullMode
}: { 
  node: TreeNode; 
  expandToLevel: number;
  resetKey: string;
  isFullMode: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(node.level < expandToLevel);
  const [contentExpanded, setContentExpanded] = useState(isFullMode);
  const hasChildren = node.children && node.children.length > 0;
  const hasContent = node.content && node.content.length > 0;
  
  // Reset expansion when expandToLevel changes
  useEffect(() => {
    setIsExpanded(node.level < expandToLevel);
    setContentExpanded(isFullMode);
  }, [resetKey, node.level, expandToLevel, isFullMode]);
  
  const handleToggle = () => {
    if (hasChildren || hasContent) {
      setIsExpanded(!isExpanded);
    }
  };
  
  const indentLevel = node.level - 1; // Level 1 starts at indent 0
  
  return (
    <div>
      {/* Title */}
      <div
        className={`flex items-start gap-2 py-1.5 hover:bg-gray-50 cursor-pointer ${
          node.level === 1 ? 'font-semibold text-gray-900' : 'text-gray-700'
        }`}
        style={{ paddingLeft: `${indentLevel * 20}px` }}
        onClick={handleToggle}
      >
        <div className="flex-shrink-0 w-4">
          {(hasChildren || hasContent) && (
            <span className="text-gray-400">
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
        </div>
        <span className="flex-1 text-sm">
          {node.title}
        </span>
      </div>
      
      {/* Content and Children */}
      {isExpanded && (
        <div>
          {/* Content paragraphs */}
          {hasContent && node.content.map((paragraph, index) => (
            <ContentItem 
              key={index}
              paragraph={paragraph}
              indentLevel={indentLevel + 1}
              isFullMode={isFullMode}
            />
          ))}
          
          {/* Child nodes */}
          {hasChildren && node.children.map((child, index) => (
            <TreeItem 
              key={index} 
              node={child}
              expandToLevel={expandToLevel}
              resetKey={resetKey}
              isFullMode={isFullMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ReportStructure({ data }: ReportStructureProps) {
  const [expandLevel, setExpandLevel] = useState<ExpandLevel>('subsections');
  const [resetKey, setResetKey] = useState(Date.now().toString());
  
  const handleLevelChange = (level: ExpandLevel) => {
    setExpandLevel(level);
    setResetKey(Date.now().toString()); // Force reset of all TreeItems
  };
  
  return (
    <div className="bg-white rounded-lg p-6 max-h-[calc(100vh-180px)] overflow-y-auto">
      {/* Level Control Buttons */}
      <div className="mb-6">
        <div className="text-xs text-gray-600 mb-2">Expansion depth</div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 inline-flex">
          <button
            onClick={() => handleLevelChange('sections')}
            className={`px-3 py-1.5 rounded-md text-sm font-mono transition-colors ${
              expandLevel === 'sections'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            &gt;
          </button>
          <button
            onClick={() => handleLevelChange('subsections')}
            className={`px-3 py-1.5 rounded-md text-sm font-mono transition-colors ${
              expandLevel === 'subsections'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            &gt;&gt;
          </button>
          <button
            onClick={() => handleLevelChange('details')}
            className={`px-3 py-1.5 rounded-md text-sm font-mono transition-colors ${
              expandLevel === 'details'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            &gt;&gt;&gt;
          </button>
          <button
            onClick={() => handleLevelChange('deeper')}
            className={`px-3 py-1.5 rounded-md text-sm font-mono transition-colors ${
              expandLevel === 'deeper'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            &gt;&gt;&gt;&gt;
          </button>
          <button
            onClick={() => handleLevelChange('full')}
            className={`px-3 py-1.5 rounded-md text-sm font-mono transition-colors ${
              expandLevel === 'full'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            &gt;&gt;&gt;&gt;&gt;
          </button>
        </div>
      </div>
      
      {/* Tree Content */}
      <div className="space-y-1">
        {data.map((node, index) => (
          <TreeItem 
            key={index} 
            node={node}
            expandToLevel={levelDepthMap[expandLevel]}
            resetKey={resetKey}
            isFullMode={expandLevel === 'full'}
          />
        ))}
      </div>
    </div>
  );
}

