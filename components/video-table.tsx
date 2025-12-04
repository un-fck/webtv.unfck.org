'use client';

import { useMemo, useState, useEffect, Fragment } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type ColumnFiltersState,
  type SortingState,
  type Column,
} from '@tanstack/react-table';
import { Video } from '@/lib/un-api';

// Extend column meta to include filter components
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    filterComponent?: (props: { column: Column<TData, TValue>; options?: string[] }) => React.JSX.Element;
    filterOptions?: string[];
  }
}

const columnHelper = createColumnHelper<Video>();

// Helper to get date at local midnight for comparison
function getLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Apply UN Web TV's fucked-up timezone workaround
// Their timestamps have incorrect timezone offsets, so they slice them off and treat as UTC
// Source: https://webtv.un.org/sites/default/files/js/js_dA57f4jZ0sYpTuwvbXRb5Fns6GZvR5BtfWCN9UflmWI.js
// Code: `const date_time=node.textContent.slice(0,19); let time=luxon.DateTime.fromISO(date_time,{'zone':'UTC'});`
function parseUNTimestamp(timestamp: string): Date {
  const dateTimeWithoutTz = timestamp.slice(0, 19); // Remove timezone offset
  return new Date(dateTimeWithoutTz + 'Z'); // Append 'Z' to treat as UTC
}

function SelectFilter({ column, options = [] }: { column: Column<Video, unknown>; options?: string[] }) {
  const filterValue = column.getFilterValue() as string;
  
  return (
    <select
      value={filterValue || ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      className="w-full px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary"
      onClick={(e) => e.stopPropagation()}
    >
      <option value="">All</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function TextFilter({ column }: { column: Column<Video, unknown> }) {
  const filterValue = column.getFilterValue() as string;
  
  return (
    <input
      type="text"
      value={filterValue || ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      placeholder="Filter..."
      className="w-full px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function DateFilter({ column, options = [] }: { column: Column<Video, unknown>; options?: string[] }) {
  const filterValue = column.getFilterValue() as string;
  
  return (
    <select
      value={filterValue || ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      className="w-full px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary"
      onClick={(e) => e.stopPropagation()}
    >
      <option value="">All dates</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function CheckboxFilter({ column }: { column: Column<Video, unknown> }) {
  const filterValue = column.getFilterValue() as boolean | undefined;
  
  return (
    <input
      type="checkbox"
      checked={filterValue === true}
      onChange={(e) => column.setFilterValue(e.target.checked ? true : undefined)}
      onClick={(e) => e.stopPropagation()}
      className="w-4 h-4 rounded border-gray-300 cursor-pointer"
      title="Show only videos with transcript"
    />
  );
}

export function VideoTable({ videos }: { videos: Video[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([
    { id: 'status', value: 'hide_scheduled' } // Hide scheduled by default
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'status', desc: false }, // Live first, then finished
    { id: 'scheduledTime', desc: true }
  ]);
  const [globalFilter, setGlobalFilter] = useState(searchParams.get('q') || '');
  const [showScheduled, setShowScheduled] = useState(false);

  // Sync URL to globalFilter (when URL changes via back/forward)
  useEffect(() => {
    const urlQuery = searchParams.get('q') || '';
    setGlobalFilter(urlQuery);
  }, [searchParams]);

  // Sync globalFilter to URL (when filter changes)
  useEffect(() => {
    const currentQuery = searchParams.get('q') || '';
    if (globalFilter !== currentQuery) {
      const params = new URLSearchParams(searchParams.toString());
      if (globalFilter) {
        params.set('q', globalFilter);
      } else {
        params.delete('q');
      }
      const newUrl = params.toString() ? `?${params.toString()}` : '/';
      router.replace(newUrl, { scroll: false });
    }
  }, [globalFilter, searchParams, router]);

  // Extract unique values for dropdowns
  const uniqueBodies = useMemo(() => 
    Array.from(new Set(videos.map(v => v.body).filter(Boolean) as string[])).sort(),
    [videos]
  );
  
  const uniqueCategories = useMemo(() => 
    Array.from(new Set(videos.map(v => v.category).filter(Boolean) as string[])).sort(),
    [videos]
  );

  // Extract unique date labels for filtering
  const uniqueDates = useMemo(() => {
    const dateLabels = new Set<string>();
    const now = new Date();
    const today = getLocalMidnight(now);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    videos.forEach(v => {
      const time = v.scheduledTime;
      if (!time) return;
      
      const date = parseUNTimestamp(time);
      const videoDate = getLocalMidnight(date);
      
      if (videoDate.getTime() === tomorrow.getTime()) {
        dateLabels.add('Tomorrow');
      } else if (videoDate.getTime() === today.getTime()) {
        dateLabels.add('Today');
      } else if (videoDate.getTime() === yesterday.getTime()) {
        dateLabels.add('Yesterday');
      } else {
        dateLabels.add(date.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric'
        }));
      }
    });

    return Array.from(dateLabels);
  }, [videos]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('scheduledTime', {
        header: 'When',
        cell: (info) => {
          const time = info.getValue();
          
          // Apply UN's timezone workaround (see parseUNTimestamp comment above)
          const date = time ? parseUNTimestamp(time) : new Date(info.row.original.date);
          
          const now = new Date();
          const today = getLocalMidnight(now);
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const videoDate = getLocalMidnight(date);
          
          let dateStr;
          if (videoDate.getTime() === tomorrow.getTime()) {
            dateStr = 'Tomorrow';
          } else if (videoDate.getTime() === today.getTime()) {
            dateStr = 'Today';
          } else if (videoDate.getTime() === yesterday.getTime()) {
            dateStr = 'Yesterday';
          } else {
            dateStr = date.toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric'
            });
          }
          
          if (!time) return dateStr; // No time available, just show date
          
          const timeStr = date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true
          });
          return `${dateStr} ${timeStr}`;
        },
        size: 160,
        enableColumnFilter: true,
        filterFn: (row, columnId, filterValue) => {
          const time = row.getValue(columnId) as string | null;
          if (!time) return false;
          
          const date = parseUNTimestamp(time);
          const now = new Date();
          const today = getLocalMidnight(now);
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const videoDate = getLocalMidnight(date);
          
          let dateStr;
          if (videoDate.getTime() === tomorrow.getTime()) {
            dateStr = 'Tomorrow';
          } else if (videoDate.getTime() === today.getTime()) {
            dateStr = 'Today';
          } else if (videoDate.getTime() === yesterday.getTime()) {
            dateStr = 'Yesterday';
          } else {
            dateStr = date.toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric'
            });
          }
          
          return dateStr === filterValue;
        },
        meta: {
          filterComponent: DateFilter,
          filterOptions: uniqueDates,
        },
      }),
      columnHelper.accessor('duration', {
        header: 'Duration',
        cell: (info) => {
          const duration = info.getValue();
          const isLive = info.row.original.status === 'live';
          if (isLive) {
            return <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />;
          }
          if (!duration || duration === '00:00:00') return <span className="text-gray-300">—</span>;
          // Strip leading zeros from HH:MM:SS
          return <span className="tabular-nums">{duration.replace(/^0+:?/, '').replace(/^0/, '')}</span>;
        },
        size: 70,
        meta: {
          align: 'right',
        },
      }),
      columnHelper.accessor('status', {
        header: () => null,
        cell: () => null,
        size: 0,
        sortingFn: (rowA, rowB) => {
          const order = { live: 0, finished: 1, scheduled: 2 };
          return order[rowA.original.status] - order[rowB.original.status];
        },
        enableColumnFilter: true,
        filterFn: (row, _columnId, filterValue) => {
          if (filterValue === 'hide_scheduled') return row.original.status !== 'scheduled';
          return true;
        },
        enableHiding: true,
      }),
      columnHelper.accessor('cleanTitle', {
        header: 'Title',
        cell: (info) => {
          const encodedId = encodeURIComponent(info.row.original.id);
          const isScheduled = info.row.original.status === 'scheduled';
          return (
            <a
              href={`/video/${encodedId}`}
              className={`hover:underline ${isScheduled ? 'text-muted-foreground' : 'text-primary'}`}
            >
              {info.getValue()}
            </a>
          );
        },
        size: 400,
        enableColumnFilter: true,
        meta: {
          filterComponent: TextFilter,
        },
      }),
      columnHelper.accessor('body', {
        header: 'Body',
        cell: (info) => info.getValue() || '—',
        size: 140,
        enableColumnFilter: true,
        meta: {
          filterComponent: SelectFilter,
          filterOptions: uniqueBodies,
        },
      }),
      columnHelper.accessor('category', {
        header: 'Category',
        cell: (info) => info.getValue() || '—',
        size: 140,
        enableColumnFilter: true,
        meta: {
          filterComponent: SelectFilter,
          filterOptions: uniqueCategories,
        },
      }),
      columnHelper.accessor('hasTranscript', {
        header: 'Transcribed',
        cell: (info) => {
          const hasTranscript = info.getValue();
          return hasTranscript ? (
            <span className="text-green-600 text-sm">✓</span>
          ) : (
            <span className="text-gray-300 text-sm">—</span>
          );
        },
        size: 100,
        enableColumnFilter: true,
        filterFn: (row, columnId, filterValue) => {
          if (filterValue === true) return row.getValue(columnId) === true;
          return true;
        },
        meta: {
          filterComponent: CheckboxFilter,
        },
      }),
    ],
    [uniqueBodies, uniqueCategories, uniqueDates]
  );

  const table = useReactTable({
    data: videos,
    columns,
    state: {
      columnFilters,
      sorting,
      globalFilter,
      columnVisibility: { status: false },
    },
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
  });

  // Exclude internal filters (status for scheduled) from "hasFilters" display
  const userFilters = columnFilters.filter(f => f.id !== 'status');
  const hasFilters = globalFilter || userFilters.length > 0;
  
  // Toggle showing scheduled videos - also update sorting
  const toggleScheduled = () => {
    const newValue = !showScheduled;
    setShowScheduled(newValue);
    if (newValue) {
      // Show scheduled: remove status filter and sort by time only (scheduled in future = first)
      setColumnFilters(prev => prev.filter(f => f.id !== 'status'));
      setSorting([{ id: 'scheduledTime', desc: true }]);
    } else {
      // Hide scheduled: add filter back and sort live first
      setColumnFilters(prev => [...prev.filter(f => f.id !== 'status'), { id: 'status', value: 'hide_scheduled' }]);
      setSorting([{ id: 'status', desc: false }, { id: 'scheduledTime', desc: true }]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-center">
        <input
          type="text"
          placeholder="Search all columns..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showScheduled}
            onChange={toggleScheduled}
            className="w-4 h-4 rounded border-gray-300"
          />
          <span className="text-muted-foreground">Show scheduled</span>
        </label>
        {hasFilters && (
          <button
            onClick={() => {
              setGlobalFilter('');
              setColumnFilters(showScheduled ? [] : [{ id: 'status', value: 'hide_scheduled' }]);
            }}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-muted"
          >
            Clear Filters
          </button>
        )}
        <div className="text-sm text-muted-foreground whitespace-nowrap ml-auto">
          {table.getFilteredRowModel().rows.length} of {videos.length} videos
        </div>
      </div>
      
      {userFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {userFilters.map((filter) => (
            <div key={filter.id} className="bg-muted px-3 py-1 rounded-full flex items-center gap-2">
              <span className="font-medium">{filter.id}:</span>
              <span>{String(filter.value)}</span>
              <button
                onClick={() => table.getColumn(filter.id)?.setFilterValue(undefined)}
                className="hover:text-primary"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <Fragment key={headerGroup.id}>
                  <tr>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted/80"
                        onClick={header.column.getToggleSortingHandler()}
                        style={{ width: header.getSize() }}
                      >
                        <div className="flex items-center gap-2">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: ' ↑',
                            desc: ' ↓',
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      </th>
                    ))}
                  </tr>
                  <tr className="border-t">
                    {headerGroup.headers.map((header) => {
                      const FilterComponent = header.column.columnDef.meta?.filterComponent;
                      const filterOptions = header.column.columnDef.meta?.filterOptions;
                      
                      return (
                        <th key={header.id} className="px-4 py-2">
                          {header.column.getCanFilter() && FilterComponent ? (
                            <FilterComponent 
                              column={header.column} 
                              options={filterOptions || []} 
                            />
                          ) : null}
                        </th>
                      );
                    })}
                  </tr>
                </Fragment>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const isScheduled = row.original.status === 'scheduled';
                return (
                  <tr key={row.id} className={`border-b hover:bg-muted/50 ${isScheduled ? 'opacity-50' : ''}`}>
                    {row.getVisibleCells().map((cell) => {
                      const align = cell.column.columnDef.meta?.align;
                      return (
                        <td key={cell.id} className={`px-4 py-3 ${align === 'right' ? 'text-right' : ''}`}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            className="px-3 py-1 border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ««
          </button>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-3 py-1 border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            «
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-3 py-1 border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            »
          </button>
          <button
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            className="px-3 py-1 border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            »»
          </button>
        </div>
        
        <div className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>

        <select
          value={table.getState().pagination.pageSize}
          onChange={(e) => table.setPageSize(Number(e.target.value))}
          className="px-3 py-1 border rounded"
        >
          {[25, 50, 100, 200].map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              Show {pageSize}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

