import React, { useState, useCallback, createContext, useContext } from 'react';
import { ChevronRight, ChevronDown, Braces, Brackets, Copy, Check, ChevronsUpDown, ChevronsDownUp } from 'lucide-react';

// Context for expand/collapse all
interface TreeContextType {
  expandAll: boolean | null; // null = no action, true = expand, false = collapse
  resetExpandAll: () => void;
  onCopy: (value: string, path: string) => void;
}

const TreeContext = createContext<TreeContextType>({
  expandAll: null,
  resetExpandAll: () => {},
  onCopy: () => {}
});

interface JsonTreeViewProps {
  data: any;
  name?: string;
  initiallyExpanded?: boolean;
  depth?: number;
  path?: string;
  isRoot?: boolean;
}

// Root wrapper component with controls
export const JsonTreeView: React.FC<JsonTreeViewProps> = (props) => {
  if (props.isRoot === false) {
    return <JsonTreeNode {...props} />;
  }
  return <JsonTreeRoot {...props} />;
};

// Root component with toolbar
const JsonTreeRoot: React.FC<JsonTreeViewProps> = ({ data, name = 'root', initiallyExpanded = false }) => {
  const [expandAll, setExpandAll] = useState<boolean | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const resetExpandAll = useCallback(() => {
    setExpandAll(null);
  }, []);

  const handleExpandAll = () => {
    setExpandAll(true);
    setTimeout(resetExpandAll, 100);
  };

  const handleCollapseAll = () => {
    setExpandAll(false);
    setTimeout(resetExpandAll, 100);
  };

  const handleCopy = useCallback((value: string, path: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    });
  }, []);

  return (
    <TreeContext.Provider value={{ expandAll, resetExpandAll, onCopy: handleCopy }}>
      <div className="relative">
        {/* Toolbar */}
        <div className="flex items-center gap-1 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={handleExpandAll}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Expand All"
          >
            <ChevronsUpDown size={12} />
            Expand
          </button>
          <button
            onClick={handleCollapseAll}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Collapse All"
          >
            <ChevronsDownUp size={12} />
            Collapse
          </button>

          {/* Copy notification */}
          {copiedPath && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 animate-in fade-in slide-in-from-right-2 duration-200">
              <Check size={10} />
              Copied!
            </span>
          )}
        </div>

        {/* Tree content */}
        <JsonTreeNode
          data={data}
          name={name}
          initiallyExpanded={initiallyExpanded}
          depth={0}
          path={name}
          isRoot={false}
        />
      </div>
    </TreeContext.Provider>
  );
};

// Tree node component
const JsonTreeNode: React.FC<JsonTreeViewProps> = ({
  data,
  name,
  initiallyExpanded = false,
  depth = 0,
  path = ''
}) => {
  const { expandAll, onCopy } = useContext(TreeContext);
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [localExpandState, setLocalExpandState] = useState<boolean | null>(null);

  // Handle expand/collapse all from context
  React.useEffect(() => {
    if (expandAll !== null) {
      setIsExpanded(expandAll);
      setLocalExpandState(expandAll);
    }
  }, [expandAll]);

  const currentPath = path || name || 'root';

  // Handle null/undefined
  if (data === null) return <PrimitiveRow name={name} value="null" type="null" depth={depth} path={currentPath} />;
  if (data === undefined) return <PrimitiveRow name={name} value="undefined" type="undefined" depth={depth} path={currentPath} />;

  const type = typeof data;
  const isArray = Array.isArray(data);
  const isObject = type === 'object' && !isArray;

  // Primitives
  if (!isArray && !isObject) {
    return <PrimitiveRow name={name} value={String(data)} type={type} depth={depth} path={currentPath} />;
  }

  // Collections (Object/Array)
  const keys = Object.keys(data);
  const isEmpty = keys.length === 0;
  const itemCount = keys.length;

  // Optimization for simple numeric arrays (like matrix rows) to display inline
  const isSimpleArray = isArray && itemCount > 0 && data.every((d: any) => typeof d === 'number');

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
    setLocalExpandState(!isExpanded);
  };

  const handleCopyCollection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopy(JSON.stringify(data, null, 2), currentPath);
  };

  if (isSimpleArray && !isExpanded) {
    const preview = `[${data.slice(0, 4).join(', ')}${itemCount > 4 ? ', ...' : ''}]`;
    return (
      <div
        className="group flex items-start font-mono text-xs leading-5 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded cursor-pointer select-none transition-colors"
        style={{ paddingLeft: `${depth * 12}px` }}
        onClick={handleToggle}
      >
        <div className="flex items-center text-gray-500 dark:text-gray-400 mr-1.5 mt-0.5">
          <ChevronRight size={10} />
        </div>
        {name && <span className="text-purple-700 dark:text-purple-400 mr-1">{name}:</span>}
        <span className="text-gray-500 dark:text-gray-400">{preview}</span>
        <span className="text-gray-400 dark:text-gray-600 ml-2 text-[10px]">{itemCount} items</span>

        {/* Copy button */}
        <button
          onClick={handleCopyCollection}
          className="ml-2 p-0.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity"
          title={`Copy ${currentPath}`}
        >
          <Copy size={10} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        className="group flex items-center font-mono text-xs leading-5 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded cursor-pointer select-none py-0.5 transition-colors"
        style={{ paddingLeft: `${depth * 12}px` }}
        onClick={handleToggle}
      >
        <div className="flex items-center text-gray-500 dark:text-gray-400 mr-1.5">
          {isEmpty ? <span className="w-[10px]" /> : (isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />)}
        </div>

        {name && <span className="text-purple-700 dark:text-purple-400 mr-1">{name}:</span>}

        <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
          {isArray ? <Brackets size={10} /> : <Braces size={10} />}
          {isEmpty ? (isArray ? '[]' : '{}') : (isArray ? `Array(${itemCount})` : `Object{${itemCount}}`)}
        </span>

        {/* Copy button */}
        <button
          onClick={handleCopyCollection}
          className="ml-2 p-0.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity"
          title={`Copy ${currentPath}`}
        >
          <Copy size={10} />
        </button>
      </div>

      {isExpanded && !isEmpty && (
        <div className="border-l border-gray-200 dark:border-gray-700 ml-1.5">
          {keys.map((key) => {
            const childPath = isArray ? `${currentPath}[${key}]` : `${currentPath}.${key}`;
            return (
              <JsonTreeNode
                key={key}
                name={key}
                data={data[key]}
                depth={depth + 1}
                path={childPath}
                isRoot={false}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

interface PrimitiveRowProps {
  name?: string;
  value: string;
  type: string;
  depth: number;
  path: string;
}

const PrimitiveRow: React.FC<PrimitiveRowProps> = ({ name, value, type, depth, path }) => {
  const { onCopy } = useContext(TreeContext);
  const [showCopied, setShowCopied] = useState(false);

  let colorClass = 'text-gray-800 dark:text-gray-200';
  if (type === 'number') colorClass = 'text-blue-600 dark:text-blue-400';
  if (type === 'string') colorClass = 'text-green-600 dark:text-green-400';
  if (type === 'boolean') colorClass = 'text-orange-600 dark:text-orange-400';
  if (type === 'null' || type === 'undefined') colorClass = 'text-gray-400 dark:text-gray-500 italic';

  const handleCopyValue = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopy(value, path);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 1500);
  };

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopy(path, path);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 1500);
  };

  const displayValue = type === 'string' ? `"${value}"` : value;

  return (
    <div
      className="group flex items-start font-mono text-xs leading-5 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded py-0.5 transition-colors"
      style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}
    >
      {name && (
        <span
          className="text-purple-700 dark:text-purple-400 mr-1 cursor-pointer hover:underline"
          onClick={handleCopyPath}
          title={`Copy path: ${path}`}
        >
          {name}:
        </span>
      )}
      <span
        className={`${colorClass} break-all cursor-pointer hover:underline`}
        onClick={handleCopyValue}
        title="Click to copy value"
      >
        {displayValue}
      </span>

      {/* Copy indicator */}
      {showCopied && (
        <span className="ml-2 flex items-center text-green-500 animate-in fade-in duration-150">
          <Check size={10} />
        </span>
      )}

      {/* Copy button on hover */}
      {!showCopied && (
        <button
          onClick={handleCopyValue}
          className="ml-2 p-0.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity"
          title="Copy value"
        >
          <Copy size={10} />
        </button>
      )}
    </div>
  );
};
