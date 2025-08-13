import React from 'react';
import { useQuery } from 'react-query';
import {
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
  ClockIcon,
  UsersIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import axios from 'axios';

const Dashboard = () => {
  const { user, isAdmin, isPoliceOfficer, isDriver } = useAuth();

  // Fetch dashboard statistics
  const { data: fineStats, isLoading: fineStatsLoading } = useQuery(
    'fineStats',
    () => axios.get('/api/fines/stats/overview').then((res) => res.data),
    {
      refetchInterval: 30000, // Refetch every 30 seconds
    }
  );

  const { data: paymentStats, isLoading: paymentStatsLoading } = useQuery(
    'paymentStats',
    () => axios.get('/api/payments/stats').then((res) => res.data),
    {
      enabled: isDriver() || isAdmin(),
      refetchInterval: 30000,
    }
  );

  const { data: userStats, isLoading: userStatsLoading } = useQuery(
    'userStats',
    () => axios.get('/api/users/stats/overview').then((res) => res.data),
    {
      enabled: isAdmin(),
      refetchInterval: 60000, // Refetch every minute
    }
  );

  const { data: violationStats, isLoading: violationStatsLoading } = useQuery(
    'violationStats',
    () => axios.get('/api/violations/stats/overview').then((res) => res.data),
    {
      enabled: isAdmin(),
      refetchInterval: 300000, // Refetch every 5 minutes
    }
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const formatCurrency = (amount, currency = 'LKR') => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const StatCard = ({ title, value, icon: Icon, color = 'primary', loading = false }) => (
    <div className="card">
      <div className="card-body">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={`p-3 rounded-md bg-${color}-100`}>
              <Icon className={`h-6 w-6 text-${color}-600`} />
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd className="text-lg font-medium text-gray-900">
                {loading ? <LoadingSpinner size="sm" /> : value}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );

  const QuickAction = ({ title, description, href, icon: Icon, color = 'primary' }) => (
    <a
      href={href}
      className="card hover:shadow-md transition-shadow duration-200 cursor-pointer"
    >
      <div className="card-body">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={`p-2 rounded-md bg-${color}-100`}>
              <Icon className={`h-5 w-5 text-${color}-600`} />
            </div>
          </div>
          <div className="ml-4">
            <h3 className="text-sm font-medium text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
      </div>
    </a>
  );

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg shadow">
        <div className="px-6 py-8 sm:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {getGreeting()}, {user?.fullName || user?.username}!
              </h1>
              <p className="mt-1 text-primary-100">
                Welcome to the Sri Lanka Police Traffic Fine Management System
              </p>
              <div className="mt-2">
                <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-primary-100 text-primary-800">
                  {user?.role === 'police_officer' ? 'Police Officer' : 
                   user?.role === 'admin' ? 'Administrator' : 'Driver'}
                </span>
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="h-16 w-16 bg-primary-500 rounded-full flex items-center justify-center">
                <svg
                  className="h-10 w-10 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.031 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Fine Statistics */}
        <StatCard
          title="Total Fines"
          value={fineStats?.totalFines || 0}
          icon={DocumentTextIcon}
          color="primary"
          loading={fineStatsLoading}
        />
        
        <StatCard
          title="Total Amount"
          value={formatCurrency(fineStats?.totalAmount || 0)}
          icon={CurrencyDollarIcon}
          color="success"
          loading={fineStatsLoading}
        />

        <StatCard
          title="Overdue Fines"
          value={fineStats?.overdueFines || 0}
          icon={ClockIcon}
          color="danger"
          loading={fineStatsLoading}
        />

        {isAdmin() && (
          <StatCard
            title="Total Users"
            value={userStats?.totalUsers || 0}
            icon={UsersIcon}
            color="secondary"
            loading={userStatsLoading}
          />
        )}

        {(isDriver() || isAdmin()) && paymentStats && (
          <StatCard
            title="Payments This Month"
            value={paymentStats.totalPayments || 0}
            icon={CheckCircleIcon}
            color="success"
            loading={paymentStatsLoading}
          />
        )}
      </div>

      {/* Status Breakdown */}
      {fineStats?.statusStats && (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Fine Status Overview
            </h3>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {fineStats.statusStats.map((stat) => (
                <div key={stat._id} className="text-center">
                  <div className={`text-2xl font-bold status-${stat._id}`}>
                    {stat.count}
                  </div>
                  <div className="text-sm text-gray-500 capitalize">
                    {stat._id}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatCurrency(stat.totalAmount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Quick Actions
          </h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {isDriver() && (
              <>
                <QuickAction
                  title="View My Fines"
                  description="Check your traffic violation fines"
                  href="/fines"
                  icon={DocumentTextIcon}
                  color="primary"
                />
                <QuickAction
                  title="Payment History"
                  description="View your payment records"
                  href="/fines?status=paid"
                  icon={CurrencyDollarIcon}
                  color="success"
                />
              </>
            )}

            {(isPoliceOfficer() || isAdmin()) && (
              <>
                <QuickAction
                  title="Create New Fine"
                  description="Issue a traffic violation fine"
                  href="/fines/create"
                  icon={DocumentTextIcon}
                  color="primary"
                />
                <QuickAction
                  title="View All Fines"
                  description="Monitor all traffic fines"
                  href="/fines"
                  icon={ExclamationTriangleIcon}
                  color="warning"
                />
              </>
            )}

            <QuickAction
              title="Traffic Violations"
              description="Browse violation types and penalties"
              href="/violations"
              icon={ExclamationTriangleIcon}
              color="secondary"
            />

            {isAdmin() && (
              <>
                <QuickAction
                  title="Manage Users"
                  description="User administration and roles"
                  href="/users"
                  icon={UsersIcon}
                  color="secondary"
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity or Additional Info */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* System Status */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              System Status
            </h3>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">API Status</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Online
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Database</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Connected
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Payment Gateway</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Help & Support */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Help & Support
            </h3>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Need assistance? Contact our support team:
              </p>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Phone:</span> +94 11 123 4567
                </div>
                <div>
                  <span className="font-medium">Email:</span> support@police.lk
                </div>
                <div>
                  <span className="font-medium">Hours:</span> 24/7 Support
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;