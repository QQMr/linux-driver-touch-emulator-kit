import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Braces, Brackets } from 'lucide-react';

interface JsonTreeViewProps {
  data: any;
  name?: string;
  initiallyExpanded?: boolean;
  depth?: number;
}

export const JsonTreeView: React.FC<JsonTreeViewProps> = ({ 
  data, 
  name, 
  initiallyExpanded = false,
  depth = 0
}) => {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);

  // Handle null/undefined
  if (data === null) return <PrimitiveRow name={name} value="null" type="null" depth={depth} />;
  if (data === undefined) return <PrimitiveRow name={name} value="undefined" type="undefined" depth={depth} />;

  const type = typeof data;
  const isArray = Array.isArray(data);
  const isObject = type === 'object' && !isArray;

  // Primitives
  if (!isArray && !isObject) {
    return <PrimitiveRow name={name} value={String(data)} type={type} depth={depth} />;
  }

  // Collections (Object/Array)
  const keys = Object.keys(data);
  const isEmpty = keys.length === 0;
  const itemCount = keys.length;
  
  // Optimization for simple numeric arrays (like matrix rows) to display inline
  const isSimpleArray = isArray && itemCount > 0 && data.every((d: any) => typeof d === 'number');
  
  if (isSimpleArray && !isExpanded) {
      const preview = `[${data.slice(0, 4).join(', ')}${itemCount > 4 ? ', ...' : ''}]`;
      return (
        <div 
            className="flex items-start font-mono text-xs leading-5 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded cursor-pointer select-none transition-colors"
            style={{ paddingLeft: `${depth * 12}px` }}
            onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
        >
            <div className="flex items-center text-gray-500 dark:text-gray-400 mr-1.5 mt-0.5">
               <ChevronRight size={10} />
            </div>
            {name && <span className="text-purple-700 dark:text-purple-400 mr-1">{name}:</span>}
            <span className="text-gray-500 dark:text-gray-400">{preview}</span>
            <span className="text-gray-400 dark:text-gray-600 ml-2 text-[10px]">{itemCount} items</span>
        </div>
      );
  }

  return (
    <div>
      <div 
        className="flex items-center font-mono text-xs leading-5 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded cursor-pointer select-none py-0.5 transition-colors"
        style={{ paddingLeft: `${depth * 12}px` }}
        onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
      >
        <div className="flex items-center text-gray-500 dark:text-gray-400 mr-1.5">
          {isEmpty ? <span className="w-[10px]" /> : (isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />)}
        </div>
        
        {name && <span className="text-purple-700 dark:text-purple-400 mr-1">{name}:</span>}
        
        <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
          {isArray ? <Brackets size={10} /> : <Braces size={10} />}
          {isEmpty ? (isArray ? '[]' : '{}') : (isArray ? `Array(${itemCount})` : `Object{${itemCount}}`)}
        </span>
      </div>

      {isExpanded && !isEmpty && (
        <div className="border-l border-gray-100 dark:border-gray-800 ml-1">
          {keys.map((key) => (
            <JsonTreeView 
              key={key} 
              name={isArray ? key : key} 
              data={data[key]} 
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const PrimitiveRow: React.FC<{ name?: string, value: string, type: string, depth: number }> = ({ name, value, type, depth }) => {
  let colorClass = 'text-gray-800 dark:text-gray-200';
  if (type === 'number') colorClass = 'text-blue-600 dark:text-blue-400';
  if (type === 'string') colorClass = 'text-green-600 dark:text-green-400';
  if (type === 'boolean') colorClass = 'text-orange-600 dark:text-orange-400';
  if (type === 'null' || type === 'undefined') colorClass = 'text-gray-400 dark:text-gray-500 italic';

  return (
    <div 
        className="flex items-start font-mono text-xs leading-5 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded py-0.5 transition-colors"
        style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}
    >
      {name && <span className="text-purple-700 dark:text-purple-400 mr-1">{name}:</span>}
      <span className={`${colorClass} break-all`}>
        {type === 'string' ? `"${value}"` : value}
      </span>
    </div>
  );
};