import { useState } from 'react';
import { ArrowLeft, Cpu, Flame, Radio } from 'lucide-react';
import type { ModelConfig } from '@creator-studio/contracts';
import { cn } from '@creator-studio/ui/utils';
import { ModelSettings } from '../settings/ModelSettings';
import { TrendSettings } from '../settings/TrendSettings';
import { XSettings } from '../settings/XSettings';

type NavSection = 'model' | 'trends' | 'x';

type Props = {
  model: ModelConfig | null;
  onModel: (config: ModelConfig) => void;
  onBack: () => void;
};

const navItems: { id: NavSection; label: string; icon: typeof Cpu }[] = [
  { id: 'model', label: '模型', icon: Cpu },
  { id: 'trends', label: '热点采集', icon: Flame },
  { id: 'x', label: 'X 账号', icon: Radio },
];

/**
 * 独立全屏设置视图
 * 包含左侧二级分类导航、左下角返回按钮，以及右侧配置表单大卡片
 */
export function SettingsView({ model, onModel, onBack }: Props) {
  const [section, setSection] = useState<NavSection>('model');

  return (
    <div className="settings-page">
      {/* 设置二级导航侧边栏 */}
      <aside className="settings-sidebar" aria-label="设置导航">
        <div className="settings-sidebar-header">
          <h2 className="settings-sidebar-title">设置</h2>
        </div>

        <nav className="settings-nav-list">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={cn('settings-nav-item', { active: section === item.id })}
                onClick={() => setSection(item.id)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="settings-sidebar-footer">
          <button type="button" className="settings-back-btn" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>返回</span>
          </button>
        </div>
      </aside>

      {/* 设置内容主体 */}
      <main className="settings-main-pane">
        <header className="settings-pane-header">
          <h1 className="settings-pane-title">
            {navItems.find(item => item.id === section)?.label}
          </h1>
        </header>

        <div className="settings-pane-content">
          {section === 'model' && <ModelSettings config={model} onSave={onModel} />}
          {section === 'trends' && <TrendSettings />}
          {section === 'x' && <XSettings />}
        </div>
      </main>
    </div>
  );
}
