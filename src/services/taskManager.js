const Task = require('../models/Task');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const eventManager = require('./eventManager');

class TaskManager {
  constructor() {
    this.tasksByEvent = new Map(); // eventId -> Map of tasks
    this.dataFile = path.join(__dirname, '../../data/tasks.json');
    this.multiEventDataFile = path.join(__dirname, '../../data/tasks-by-event.json');
    this.hackathonDate = new Date('2025-09-24T09:00:00'); // September 24th, 2025
    this.categories = [
      'tech', 'marketing', 'sponsors', 'content'
    ];
    this.loadTasks();
    this.initializeDefaultTasks();
  }

  loadTasks() {
    try {
      // Try to load multi-event format first
      if (fs.existsSync(this.multiEventDataFile)) {
        const data = JSON.parse(fs.readFileSync(this.multiEventDataFile, 'utf8'));
        Object.keys(data).forEach(eventId => {
          const eventTasks = new Map();
          data[eventId].forEach(taskData => {
            const task = new Task(taskData);
            eventTasks.set(task.id, task);
          });
          this.tasksByEvent.set(eventId, eventTasks);
        });
        logger.info(`Loaded tasks for ${this.tasksByEvent.size} events from multi-event storage`);
      }
      // Fallback to single-event format for migration
      else if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        const aiHackathonTasks = new Map();
        data.forEach(taskData => {
          const task = new Task(taskData);
          aiHackathonTasks.set(task.id, task);
        });
        this.tasksByEvent.set('ai-hackathon-2025', aiHackathonTasks);
        this.tasksByEvent.set('new-event-2025', new Map());
        logger.info(`Migrated ${data.length} tasks from single-event storage`);
        this.saveTasks(); // Save in new format
      }
    } catch (error) {
      logger.error('Failed to load tasks:', error);
    }
  }

  saveTasks() {
    try {
      const dir = path.dirname(this.multiEventDataFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tasksByEventData = {};
      this.tasksByEvent.forEach((tasks, eventId) => {
        tasksByEventData[eventId] = Array.from(tasks.values()).map(task => task.toJSON());
      });

      fs.writeFileSync(this.multiEventDataFile, JSON.stringify(tasksByEventData, null, 2));
      logger.debug('Multi-event tasks saved to storage');
    } catch (error) {
      logger.error('Failed to save tasks:', error);
    }
  }

  // Helper methods for current event
  getCurrentEventTasks() {
    const currentEvent = eventManager.getCurrentEvent();
    if (!currentEvent) return new Map();

    if (!this.tasksByEvent.has(currentEvent.id)) {
      this.tasksByEvent.set(currentEvent.id, new Map());
    }
    return this.tasksByEvent.get(currentEvent.id);
  }

  getTasksForEvent(eventId) {
    if (!this.tasksByEvent.has(eventId)) {
      this.tasksByEvent.set(eventId, new Map());
    }
    return this.tasksByEvent.get(eventId);
  }

  // Legacy property for backward compatibility
  get tasks() {
    return this.getCurrentEventTasks();
  }

  initializeDefaultTasks() {
    if (this.tasks.size === 0) {
      const defaultTasks = [
        // Virtual Event Tasks Only
        {
          title: 'Design promotional graphics for social media',
          description: 'Create engaging visual content for social media marketing campaigns',
          category: 'marketing',
          priority: 'high',
          dueDate: this.getDateBeforeHackathon(28),
          estimatedHours: 12,
          tags: ['design', 'social-media', 'graphics']
        },
        {
          title: 'Finalize event agenda and speaker lineup',
          description: 'Complete the event schedule and confirm all speakers',
          category: 'content',
          priority: 'critical',
          dueDate: this.getDateBeforeHackathon(21),
          estimatedHours: 15,
          isOnCriticalPath: true,
          tags: ['agenda', 'speakers', 'schedule']
        },
        {
          title: 'Feature Glitch the Robot',
          description: 'Integrate and showcase Glitch the Robot in event programming',
          category: 'content',
          priority: 'high',
          dueDate: this.getDateBeforeHackathon(14),
          estimatedHours: 8,
          tags: ['glitch', 'robot', 'feature']
        },
        {
          title: 'Brain Behinds the Bots on Social',
          description: 'Create and execute social media campaign highlighting bot creators',
          category: 'marketing',
          priority: 'medium',
          dueDate: this.getDateBeforeHackathon(20),
          estimatedHours: 10,
          tags: ['social-media', 'bots', 'creators']
        },
        {
          title: 'Build the virtual event platform VCS',
          description: 'Develop and deploy the Virtual Conference System (VCS) platform',
          category: 'tech',
          priority: 'critical',
          dueDate: this.getDateBeforeHackathon(30),
          estimatedHours: 40,
          isOnCriticalPath: true,
          tags: ['vcs', 'platform', 'virtual-event']
        },
        {
          title: 'Connect VCS to Luma registration integration',
          description: 'Integrate VCS platform with Luma registration system',
          category: 'tech',
          priority: 'critical',
          dueDate: this.getDateBeforeHackathon(21),
          estimatedHours: 12,
          isOnCriticalPath: true,
          dependencies: ['Build the virtual event platform VCS'],
          tags: ['vcs', 'luma', 'integration']
        },
        {
          title: 'Set up Chatbase Bot integration in VCS',
          description: 'Configure Chatbase Bot functionality within the VCS platform',
          category: 'tech',
          priority: 'high',
          dueDate: this.getDateBeforeHackathon(18),
          estimatedHours: 8,
          dependencies: ['Build the virtual event platform VCS'],
          tags: ['chatbase', 'bot', 'vcs']
        },
        {
          title: 'Set up Snapsight integration in VCS',
          description: 'Integrate Snapsight functionality into the VCS platform',
          category: 'tech',
          priority: 'high',
          dueDate: this.getDateBeforeHackathon(18),
          estimatedHours: 8,
          dependencies: ['Build the virtual event platform VCS'],
          tags: ['snapsight', 'integration', 'vcs']
        },
        {
          title: 'Design graphics overlay package for LIVE virtual event',
          description: 'Create comprehensive graphics package for live streaming',
          category: 'content',
          priority: 'high',
          dueDate: this.getDateBeforeHackathon(12),
          estimatedHours: 16,
          tags: ['graphics', 'overlay', 'live-stream']
        },
        {
          title: 'Upload & Build Graphics Scenes in Streamyard',
          description: 'Set up all graphic scenes and overlays in Streamyard platform',
          category: 'tech',
          priority: 'high',
          dueDate: this.getDateBeforeHackathon(7),
          estimatedHours: 6,
          dependencies: ['Design graphics overlay package for LIVE virtual event'],
          tags: ['streamyard', 'graphics', 'scenes']
        },
        {
          title: 'Get a Headcount of all Sponsors for Booths in VCS',
          description: 'Collect sponsor booth requirements and finalize virtual booth allocation',
          category: 'sponsors',
          priority: 'medium',
          dueDate: this.getDateBeforeHackathon(14),
          estimatedHours: 4,
          dependencies: ['Build the virtual event platform VCS'],
          tags: ['sponsors', 'booths', 'headcount']
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
    const currentEvent = eventManager.getCurrentEvent();
    if (!currentEvent) return 0;

    const now = new Date();
    const eventDate = new Date(currentEvent.date);
    const diffTime = eventDate - now;
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
    const allTasks = this.getAllTasks();
    // Exclude post-event tasks from completion calculation
    const tasks = allTasks.filter(t => t.category !== 'post-event');
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const overdue = tasks.filter(t => t.isOverdue()).length;
    const atRisk = tasks.filter(t => t.isAtRisk()).length;
    
    // Calculate weighted completion rate based on progress field
    let totalWeightedCompletion = 0;
    tasks.forEach(task => {
      if (task.status === 'completed') {
        totalWeightedCompletion += 100;
      } else if (task.status === 'in_progress') {
        // Use progress field, default to 50% if not set
        const percentage = task.progress || 50;
        totalWeightedCompletion += percentage;
      }
      // Pending tasks contribute 0%
    });
    const weightedCompletionRate = Math.round(totalWeightedCompletion / total);

    return {
      total,
      completed,
      inProgress,
      blocked,
      pending: total - completed - inProgress - blocked,
      overdue,
      atRisk,
      completionRate: total > 0 ? weightedCompletionRate : 0,
      daysUntilHackathon: this.getDaysUntilHackathon()
    };
  }

  identifyGaps() {
    const gaps = [];
    const tasks = this.getAllTasks();
    const daysLeft = this.getDaysUntilHackathon();

    // Skip all gap checking for End of Year Event - it's a fresh slate event
    // Only show gaps for active project phases with existing tasks
    if (tasks.length === 0) {
      return gaps; // Return empty array for fresh events
    }

    // Check timeline pressure only for events with tasks
    if (daysLeft <= 14 && tasks.length > 0) {
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
    const upcoming = this.getUpcomingTasks(30); // Show all upcoming tasks within 30 days
    const pending = this.getTasksByStatus('pending');
    const inProgress = this.getTasksByStatus('in_progress');
    const gaps = this.identifyGaps();
    const daysLeft = this.getDaysUntilHackathon();
    
    // Sort each category by due date (ascending - closest to today first)
    const sortByDueDate = (tasks) => {
      return tasks.sort((a, b) => {
        const aDate = new Date(a.dueDate);
        const bDate = new Date(b.dueDate);
        return aDate - bDate;
      });
    };
    
    return {
      date: new Date().toISOString().split('T')[0],
      daysUntilHackathon: daysLeft,
      stats,
      overdue: sortByDueDate([...overdue]).map(t => ({ id: t.id, title: t.title, daysOverdue: -t.getDaysUntilDue() })),
      upcoming: sortByDueDate([...upcoming]).map(t => ({ id: t.id, title: t.title, dueIn: t.getDaysUntilDue() })),
      pending: sortByDueDate([...pending]).map(t => ({ id: t.id, title: t.title, dueIn: t.getDaysUntilDue() })),
      inProgress: sortByDueDate([...inProgress]).map(t => ({ id: t.id, title: t.title, dueIn: t.getDaysUntilDue() })),
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