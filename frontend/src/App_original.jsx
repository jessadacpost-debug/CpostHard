The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
                              const isOverdue = delayRisk === 'OVERDUE';
                              const assignedOwnerDraftId = fz.assignedDraftId || proj.draftId;
                              const isDraft = currentUser && currentUser.role === 'draft' && assignedOwnerDraftId === currentUser.id;
                              const canEdit = currentUser?.role === 'admin' ||
                                (currentUser?.role === 'engineer' && proj.engineerId === currentUser.id) ||
                                (currentUser?.role === 'draft' && (fz.assignedDraftId || proj.draftId) === currentUser.id);

                              return (
                                <div
                                  key={fz.id}
                                  onClick={() => {
                                    if (canEdit) openFloorEditor(fz, proj);
                                  }}
                                  className={`p-2 rounded-lg border h-20 flex flex-col justify-between relative transition-all duration-150 ${getStatusStyle(fz.status)} ${canEdit ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default opacity-60 grayscale-[30%]'}`}
                                >
                                  <div>
                                    <div className="flex justify-between items-start">
                                      <h3 className="font-bold text-[11px] truncate text-slate-200">{fz.name}</h3>
       
<truncated 45283 bytes>
 2: Workload Settings */}
              {adminSubTab === 'workload' && (
                <form onSubmit={handleSaveSettings} className="space-y-6 max-w-xl">
                  <h3 className="text-sm font-extrabold text-slate-300 border-b border-slate-900 pb-2 flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-brand-400" />
                    กำหนดเกณฑ์คอขวดและเวลาเฉลี่ย (1 ชั้น = 1 แผ่นเสมอ)
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                        1. ตัวคูณจำนวนชั่วโมงในการร่างแบบ / 1 ชั้นงาน (ชั่วโมงต่อชั้น)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        required
                        className="glass-input w-full px-4 py-2.5 rounded-lg text-sm text-slate-200 font-bold"
                        value={cfgHoursPerSheet}
                        onChange={(e) => setCfgHoursPerSheet(e.target.value)}
                      />
                      <span className="text-[10px] text-slate-500 block mt-1">
                        * ปัจจุบันกำหนดสูตร: 1 ชั้น = {cfgHoursPerSheet} ชั่วโมงร่างแบบ (ใช้คำนวณ Work Hours บนแดชบอร์ด)
                      </span>
                    </div>

<truncated 11802 bytes>

NOTE: The output was truncated because it was too long. Use a more targeted query or a smaller range to get the information you need.