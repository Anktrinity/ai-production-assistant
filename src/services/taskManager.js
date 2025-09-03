const Task = require('../models/Task');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class TaskManager {
  constructor() {
    this.tasks = new Map();
    this.dataFile = path.join(__dirname, '../../data/tasks.json');
    this.hackathonDate = new Date('2024-09-24T09:00:00'); // September 24th, 2024
    this.categories = [
      'venue', 'catering', 'tech', 'marketing', 'sponsors',
      'registration', 'logistics', 'judging', 'prizes', 'content'
    ];
    this.loadTasks();
    this.initializeDefaultTasks();
  }

  loadTasks() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        data.forEach(taskData => {
          const task = new Task(taskData);
          this.tasks.set(task.id, task);
        });
        logger.info(`Loaded ${this.tasks.size} tasks from storage`);
      }
    } catch (error) {
      logger.error('Failed to load tasks:', error);
    }
  }

  saveTasks() {
    try {
      const dir = path.dirname(this.dataFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const tasksArray = Array.from(this.tasks.values()).map(task => task.toJSON());
      fs.writeFileSync(this.dataFile, JSON.stringify(tasksArray, null, 2));
      logger.debug('Tasks saved to storage');
    } catch (error) {
      logger.error('Failed to save tasks:', error);
    }
  }

  initializeDefaultTasks() {
    if (this.tasks.size === 0) {
      const defaultTasks = [
        {
          title: 'Venue booking confirmation',
          description: 'Confirm venue availability and setup requirements',
          category: 'venue',
          priority: 'critical',
          dueDate: this.getDateBeforeHackathon(30),
          estimatedHours: 4,
          isOnCriticalPath: true
        },
        {
          title: 'Sponsor outreach campaign',
          description: 'Contact potential sponsors and secure funding',
          category: 'sponsors',
          priority: 'high',
          dueDate: this.getDateBeforeHackathon(45),
          estimatedHours: 20
        },
        {
          title: 'Registration platform setup',
          description: 'Set up and test participant registration system',
          category: 'registration',
          priority: 'high',
          dueDate: this.getDateBeforeHackathon(21),
          estimatedHours: 8
        },
        {
          title: 'Catering arrangements',
          description: 'Arrange meals and refreshments for participants',
          category: 'catering',
          priority: 'high',
          dueDate: this.getDateBeforeHackathon(14),
          estimatedHours: 6
        },
        {
          title: 'Technical infrastructure setup',
          description: 'WiFi, power, AV equipment, and tech support',
          category: 'tech',
          priority: 'critical',
          dueDate: this.getDateBeforeHackathon(7),
          estimatedHours: 12,
          isOnCriticalPath: true
        },
        {
          title: 'Judge recruitment and briefing',
          description: 'Recruit qualified judges and brief them on criteria',
          category: 'judging',
          priority: 'high',
          dueDate: this.getDateBeforeHackathon(14),
          estimatedHours: 10
        },
        {
          title: 'Prize procurement',
          description: 'Purchase or arrange prizes for winners',
          category: 'prizes',
          priority: 'medium',
          dueDate: this.getDateBeforeHackathon(10),
          estimatedHours: 4
        },
        {
          title: 'Marketing campaign launch',
          description: 'Launch social media and PR campaign',
          category: 'marketing',
          priority: 'medium',
          dueDate: this.getDateBeforeHackathon(35),
          estimatedHours: 15
        }
      ];

      defaultTasks.forEach(taskData => {
        const task = new Task(taskData);
        this.tasks.set(task.id, task);
      });

      this.saveTasks();
      logger.info('Initialized with default hackathon tasks');
    }
  }

  getDateBeforeHackathon(days) {
    const date = new Date(this.hackathonDate);
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }

  getDaysUntilHackathon() {
    const now = new Date();
    const diffTime = this.hackathonDate - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  createTask(taskData) {
    const task = new Task(taskData);
    this.tasks.set(task.id, task);
    this.saveTasks();
    logger.info('Created task:', { id: task.id, title: task.title });
    return task;
  }

  updateTask(id, updates) {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    
    task.update(updates);
    this.saveTasks();
    logger.info('Updated task:', { id, updates });
    return task;
  }

  deleteTask(id) {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    
    this.tasks.delete(id);
    this.saveTasks();
    logger.info('Deleted task:', { id, title: task.title });
    return task;
  }

  getTask(id) {
    return this.tasks.get(id);
  }

  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  getTasksByStatus(status) {
    return this.getAllTasks().filter(task => task.status === status);
  }

  getTasksByCategory(category) {
    return this.getAllTasks().filter(task => task.category === category);
  }

  getTasksByAssignee(assignee) {
    return this.getAllTasks().filter(task => task.assignee === assignee);
  }

  getOverdueTasks() {
    return this.getAllTasks().filter(task => task.isOverdue());
  }

  getAtRiskTasks() {
    return this.getAllTasks().filter(task => task.isAtRisk());
  }

  getCriticalPathTasks() {
    return this.getAllTasks().filter(task => task.isOnCriticalPath);
  }

  getUpcomingTasks(days = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    
    return this.getAllTasks().filter(task => {
      if (!task.dueDate || task.status === 'completed') return false;
      const dueDate = new Date(task.dueDate);
      return dueDate <= cutoff;
    }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }

  getCompletionStats() {
    const tasks = this.getAllTasks();
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const overdue = tasks.filter(t => t.isOverdue()).length;
    const atRisk = tasks.filter(t => t.isAtRisk()).length;

    return {
      total,
      completed,
      inProgress,
      blocked,
      pending: total - completed - inProgress - blocked,
      overdue,
      atRisk,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      daysUntilHackathon: this.getDaysUntilHackathon()
    };
  }

  identifyGaps() {
    const gaps = [];
    const tasks = this.getAllTasks();
    const daysLeft = this.getDaysUntilHackathon();
    
    // Check for missing critical categories
    const presentCategories = new Set(tasks.map(t => t.category));
    const missingCategories = this.categories.filter(cat => !presentCategories.has(cat));
    
    missingCategories.forEach(category => {
      gaps.push({
        type: 'missing_category',
        category,
        severity: 'medium',
        description: `No tasks found for ${category} category`,
        suggestedAction: `Create tasks for ${category} planning`
      });
    });

    // Check for overdue critical path items
    const overdueCritical = tasks.filter(t => t.isOnCriticalPath && t.isOverdue());
    overdueCritical.forEach(task => {
      gaps.push({
        type: 'overdue_critical',
        taskId: task.id,
        taskTitle: task.title,
        severity: 'critical',
        description: `Critical path task "${task.title}" is overdue`,
        suggestedAction: 'Immediate attention required - reassign or break down task'
      });
    });

    // Check for tasks without assignees
    const unassigned = tasks.filter(t => !t.assignee && t.status !== 'completed');
    if (unassigned.length > 0) {
      gaps.push({
        type: 'unassigned_tasks',
        count: unassigned.length,
        severity: 'medium',
        description: `${unassigned.length} tasks without assignees`,
        suggestedAction: 'Assign owners to ensure accountability'
      });
    }

    // Check timeline pressure
    if (daysLeft <= 14) {
      const incomplete = tasks.filter(t => t.status !== 'completed').length;
      if (incomplete > daysLeft * 2) {
        gaps.push({
          type: 'timeline_pressure',
          severity: 'high',
          description: `${incomplete} incomplete tasks with only ${daysLeft} days remaining`,
          suggestedAction: 'Consider task prioritization and additional resources'
        });
      }
    }

    return gaps.sort((a, b) => {
      const severityOrder = { critical: 3, high: 2, medium: 1, low: 0 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  generateDailySummary() {
    const stats = this.getCompletionStats();
    const overdue = this.getOverdueTasks();
    const upcoming = this.getUpcomingTasks(3);
    const gaps = this.identifyGaps();
    const daysLeft = this.getDaysUntilHackathon();
    
    return {
      date: new Date().toISOString().split('T')[0],
      daysUntilHackathon: daysLeft,
      stats,
      overdue: overdue.map(t => ({ id: t.id, title: t.title, daysOverdue: -t.getDaysUntilDue() })),
      upcoming: upcoming.map(t => ({ id: t.id, title: t.title, dueIn: t.getDaysUntilDue() })),
      criticalGaps: gaps.filter(g => g.severity === 'critical'),
      recommendations: this.generateRecommendations(stats, gaps, daysLeft)
    };
  }

  generateRecommendations(stats, gaps, daysLeft) {
    const recommendations = [];
    
    if (stats.completionRate < 50 && daysLeft <= 30) {
      recommendations.push({
        priority: 'high',
        action: 'Accelerate task completion',
        reason: `Only ${stats.completionRate}% complete with ${daysLeft} days remaining`
      });
    }
    
    if (stats.overdue > 0) {
      recommendations.push({
        priority: 'critical',
        action: 'Address overdue tasks immediately',
        reason: `${stats.overdue} tasks are overdue`
      });
    }
    
    if (gaps.filter(g => g.severity === 'critical').length > 0) {
      recommendations.push({
        priority: 'critical',
        action: 'Resolve critical gaps',
        reason: 'Critical planning gaps identified'
      });
    }
    
    if (daysLeft <= 7) {
      recommendations.push({
        priority: 'high',
        action: 'Final preparations checklist',
        reason: 'Event is next week - focus on final preparations'
      });
    }
    
    return recommendations;
  }
}

module.exports = new TaskManager();