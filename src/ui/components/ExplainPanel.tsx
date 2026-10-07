import { useState } from 'react';
import type { AuditStep } from '../../engine/types';

interface AuditNodeProps {
  node: AuditStep;
  currency: string;
  depth?: number;
}

export function AuditNode({ node, currency, depth = 0 }: AuditNodeProps) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="audit-node" style={{ marginLeft: depth * 12 }}>
      <div
        className="audit-node-header"
        onClick={() => hasChildren && setOpen(o => !o)}
        style={{ cursor: hasChildren ? 'pointer' : 'default' }}
      >
        {hasChildren && (
          <span className={`collapsible-arrow ${open ? 'open' : ''}`}>▶</span>
        )}
        {!hasChildren && <span style={{ width: 14 }} />}
        <span>{node.label}</span>
        <span className="audit-formula" style={{ marginLeft: 8 }}>({node.formula})</span>
        <span className="audit-node-value">
          {currency} {node.value.toFixed(4)}
        </span>
      </div>
      {hasChildren && open && (
        <div className="audit-children">
          {node.children!.map((child, i) => (
            <AuditNode key={i} node={child} currency={currency} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ExplainPanelProps {
  title: string;
  audit: AuditStep[];
  currency: string;
  onClose?: () => void;
}

export function ExplainPanel({ title, audit, currency, onClose }: ExplainPanelProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">🔍 Explain: {title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="card">
            <div className="audit-tree">
              {audit.map((node, i) => (
                <AuditNode key={i} node={node} currency={currency} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
