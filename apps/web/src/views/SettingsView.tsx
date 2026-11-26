import { useState } from 'react';
import { ArrowLeft, Clock, Cpu, Flame, Radio } from 'lucide-react';
import { cn } from '@creator-studio/ui/utils';
import { ModelSettings } from '../settings/ModelSettings';
import { TrendSettings } from '../settings/TrendSettings';
import { XSettings } from '../settings/XSettings';
import { ScheduleSettings } from '../settings/ScheduleSettings';

export type SettingsSection = 'model' | 'trends' | 'x' | 'schedules';

const navItems: { id: SettingsSection; label: string; icon: typeof Cpu }[] = [
  { id: 'model', label: '模型', icon: Cpu },
  { id: 'trends', label: '热点采集', icon: Flame },
  { id: 'x', label: 'X 账号', icon: Radio },
  { id: 'schedules', label: '定时任务', icon: Clock },
];

/**
 * 独立全屏设置视图
 * 包含左侧二级分类导航、左下角返回按钮，以及右侧配置表单大卡片
 */
export function SettingsView({ initialSection, onBack, onOpenRunSession }: {
  initialSection: SettingsSection;
  onBack: () => void;
  onOpenRunSession: (id: string) => void;
}) {
  const [section, setSection] = useState(initialSection);

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

        <div className={cn('settings-pane-content', { 'model-pane-content': section === 'model' || section === 'schedules' })}>
          {section === 'model' && <ModelSettings />}
          {section === 'trends' && <TrendSettings />}
          {section === 'x' && <XSettings />}
          {section === 'schedules' && <ScheduleSettings onOpenRunSession={onOpenRunSession} />}
        </div>
      </main>
    </div>
  );
}
