import { MessageSquare, Moon, Settings, Sun } from 'lucide-react';
import { cn } from '@creator-studio/ui/utils';

type Props = {
  currentView: 'chat' | 'settings';
  onSelectView: (view: 'chat' | 'settings') => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

/**
 * 最左侧窄图标菜单栏
 * 包含主导航会话图标、暗黑模式切换和设置入口
 */
export function IconMenu({ currentView, onSelectView, theme, onToggleTheme }: Props) {
  return (
    <aside className="icon-menu" aria-label="应用主导航">
      {/* 主导航项 */}
      <div className="icon-menu-nav">
        <button
          type="button"
          className={cn('icon-menu-item', { active: currentView === 'chat' })}
          title="会话"
          aria-label="会话"
          onClick={() => onSelectView('chat')}
        >
          <MessageSquare size={20} />
        </button>
      </div>

      {/* 底部导航项：主题切换与独立设置页入口 */}
      <div className="icon-menu-footer">
        <button
          type="button"
          className="icon-menu-item"
          title={theme === 'dark' ? '切换为浅色模式' : '切换为深色模式'}
          aria-label="主题切换"
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button
          type="button"
          className={cn('icon-menu-item', { active: currentView === 'settings' })}
          title="系统设置"
          aria-label="系统设置"
          onClick={() => onSelectView('settings')}
        >
          <Settings size={20} />
        </button>
      </div>
    </aside>
  );
}
