"use client";

import { useState, useEffect, useRef } from "react";
import {
  getUsers,
  getMessages,
  sendMessage,
  markAsRead,
  createGroup,
  updateGroup,
  getGroups,
  getGroupMessages,
  sendGroupMessage,
  getUnreadCounts,
} from "@/app/actions/chat";
import { useRealtime } from "@/hooks/use-realtime";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  lastMessageAt?: Date | string | null;
};

type Group = {
  id: number;
  name: string;
  imageUrl: string | null;
  members: { userId: number; user: { id: number; name: string } }[];
  messages: { createdAt: Date }[];
};

type Message = {
  id: number;
  content: string;
  senderId: number;
  receiverId?: number | null;
  groupId?: number | null;
  createdAt: Date;
  sender: { name: string };
};

type UnreadCount = {
  type: "user" | "group";
  id: number;
  count: number;
};

interface ChatInterfaceProps {
  currentUser: User;
}

export default function ChatInterface({ currentUser }: ChatInterfaceProps) {
  const [activeTab, setActiveTab] = useState<"users" | "groups">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<UnreadCount[]>([]);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Group creation state
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupImage, setNewGroupImage] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);

  // Group editing state
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupImage, setEditGroupImage] = useState("");
  const [editMemberIds, setEditMemberIds] = useState<number[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch users and groups on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [usersData, groupsData, unreadData] = await Promise.all([
          getUsers(),
          getGroups(),
          getUnreadCounts(),
        ]);
        setUsers(usersData as User[]);
        setGroups(groupsData as unknown as Group[]);
        setUnreadCounts(unreadData);
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Poll for new messages and unread counts every 5 seconds
  /* REMOVED POLLING
  useEffect(() => {
     // ...
     const interval = setInterval(...)
     return () => clearInterval(interval);
  }, [selectedUser, selectedGroup]); 
  */

  // Realtime Subscription
  useRealtime(currentUser.id, async (msg) => {
    // 1. New Message
    if (
      msg.channel.endsWith(`:user:${currentUser.id}:chat`) &&
      msg.data.type === "new-message"
    ) {
      // If current chat is open with the sender
      if (selectedUser && msg.data.senderId === selectedUser.id) {
        const data = await getMessages(selectedUser.id);
        setMessages(data);
        await markAsRead(selectedUser.id, "user");
      } else if (selectedGroup) {
        // If group logic is here, check group ID (msg.data.groupId)
        // Currently we just refetch if ANY message comes for now or refine logic.
        // To keep it simple and robust:
        const data = await getGroupMessages(selectedGroup.id);
        setMessages(data);
        await markAsRead(selectedGroup.id, "group");
      }

      // Always update unread counts
      const unreadData = await getUnreadCounts();
      setUnreadCounts(unreadData);
    }

    // 2. Notification (Optional: Check if we want to show chat badge update on notification too?)
    if (msg.channel.endsWith(`:user:${currentUser.id}:notifications`)) {
      // Maybe just update unread counts just in case system notifications relate to chat
      const unreadData = await getUnreadCounts();
      setUnreadCounts(unreadData);
    }
  });

  // Fetch messages when selectedUser or selectedGroup changes
  useEffect(() => {
    if (!selectedUser && !selectedGroup) return;

    const fetchMessages = async () => {
      setLoadingMessages(true);
      try {
        let data;
        if (selectedUser) {
          data = await getMessages(selectedUser.id);
          await markAsRead(selectedUser.id, "user");
        } else if (selectedGroup) {
          data = await getGroupMessages(selectedGroup.id);
          await markAsRead(selectedGroup.id, "group");
        }
        setMessages(data || []);
        // Refresh unread counts after reading
        const unreadData = await getUnreadCounts();
        setUnreadCounts(unreadData);
      } catch (error) {
        console.error("Failed to fetch messages:", error);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchMessages();
  }, [selectedUser, selectedGroup]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!selectedUser && !selectedGroup) || !newMessage.trim()) return;

    try {
      if (selectedUser) {
        await sendMessage(selectedUser.id, newMessage);
        const data = await getMessages(selectedUser.id);
        setMessages(data);
      } else if (selectedGroup) {
        await sendGroupMessage(selectedGroup.id, newMessage);
        const data = await getGroupMessages(selectedGroup.id);
        setMessages(data);
      }
      setNewMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || selectedMemberIds.length === 0) return;

    try {
      const newGroup = await createGroup(
        newGroupName,
        newGroupImage,
        selectedMemberIds,
      );
      setGroups([...groups, newGroup as unknown as Group]);
      setIsCreateGroupModalOpen(false);
      setNewGroupName("");
      setNewGroupImage("");
      setSelectedMemberIds([]);
      // Switch to group view
      setActiveTab("groups");
    } catch (error) {
      console.error("Failed to create group:", error);
      alert("שגיאה ביצירת הקבוצה");
    }
  };

  const handleUpdateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup || !editGroupName.trim() || editMemberIds.length === 0)
      return;

    try {
      await updateGroup(
        selectedGroup.id,
        editGroupName,
        editGroupImage,
        editMemberIds,
      );

      // Refresh groups logic roughly
      const updatedGroups = await getGroups();
      setGroups(updatedGroups as unknown as Group[]);

      // Update selected group in place
      const updatedGroup = updatedGroups.find((g) => g.id === selectedGroup.id);
      if (updatedGroup) setSelectedGroup(updatedGroup as unknown as Group);

      setIsEditGroupModalOpen(false);
    } catch (error) {
      console.error("Failed to update group:", error);
      alert("שגיאה בעדכון הקבוצה");
    }
  };

  const openEditGroupModal = () => {
    if (!selectedGroup) return;
    setEditGroupName(selectedGroup.name);
    setEditGroupImage(selectedGroup.imageUrl || "");
    // Extract member IDs. Note the structure in type Group: members: { userId, user: { ... } }[]
    // We need to match how createGroup works.
    setEditMemberIds(selectedGroup.members.map((m) => m.userId || m.user.id));
    setIsEditGroupModalOpen(true);
  };

  const toggleMemberSelection = (userId: number, isEdit: boolean = false) => {
    if (isEdit) {
      setEditMemberIds((prev) =>
        prev.includes(userId)
          ? prev.filter((id) => id !== userId)
          : [...prev, userId],
      );
    } else {
      setSelectedMemberIds((prev) =>
        prev.includes(userId)
          ? prev.filter((id) => id !== userId)
          : [...prev, userId],
      );
    }
  };

  const formatTime = (date: Date | string) => {
    if (!date) return "";
    return new Date(date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getUnreadCount = (id: number, type: "user" | "group") => {
    const item = unreadCounts.find((c) => c.type === type && c.id === id);
    return item ? item.count : 0;
  };

  // ...
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);

  useEffect(() => {
    if (selectedUser || selectedGroup) {
      setShowChatOnMobile(true);
    } else {
      setShowChatOnMobile(false);
    }
  }, [selectedUser, selectedGroup]);

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[500px] bg-white rounded-lg shadow-xl overflow-hidden border border-gray-200 relative">
      {/* Sidebar */}
      <div
        className={`md:w-1/3 border-r border-gray-200 bg-gray-50 flex-col ${
          showChatOnMobile ? "hidden md:flex" : "flex w-full"
        }`}
      >
        <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">צ'אט ארגוני</h2>
          <button
            onClick={() => setIsCreateGroupModalOpen(true)}
            className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition"
          >
            + קבוצה
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white">
          <button
            className={`flex-1 py-3 text-sm font-medium relative ${
              activeTab === "users"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("users")}
          >
            משתמשים
            {unreadCounts.filter((c) => c.type === "user").length >
              0 /* Optional: show dot on tab */ && (
              <span className="absolute top-2 left-1/4 w-2 h-2 bg-red-500 rounded-full"></span>
            )}
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium relative ${
              activeTab === "groups"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("groups")}
          >
            קבוצות
            {unreadCounts.filter((c) => c.type === "group").length > 0 && (
              <span className="absolute top-2 left-1/4 w-2 h-2 bg-red-500 rounded-full"></span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto w-full">
          {loading ? (
            <div className="p-4 text-center text-gray-500">טוען...</div>
          ) : activeTab === "users" ? (
            (users || []).map((user) => {
              const unread = getUnreadCount(user.id, "user");
              return (
                <div
                  key={user.id}
                  onClick={() => {
                    setSelectedUser(user);
                    setSelectedGroup(null);
                  }}
                  className={`p-4 cursor-pointer hover:bg-gray-100 transition-colors border-b border-gray-100 flex justify-between items-center ${
                    selectedUser?.id === user.id
                      ? "bg-blue-50 border-l-4 border-l-blue-500"
                      : ""
                  }`}
                >
                  <div>
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      {user.name}
                      {unread > 0 && (
                        <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                          {unread}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                  {user.lastMessageAt && (
                    <div className="text-xs text-gray-400">
                      {formatTime(user.lastMessageAt)}
                    </div>
                  )}
                </div>
              );
            })
          ) : (groups || []).length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">
              אין קבוצות עדיין
            </div>
          ) : (
            (groups || []).map((group) => {
              const unread = getUnreadCount(group.id, "group");
              return (
                <div
                  key={group.id}
                  onClick={() => {
                    setSelectedGroup(group);
                    setSelectedUser(null);
                  }}
                  className={`p-4 cursor-pointer hover:bg-gray-100 transition-colors border-b border-gray-100 flex items-center justify-between ${
                    selectedGroup?.id === group.id
                      ? "bg-blue-50 border-l-4 border-l-blue-500"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {group.imageUrl ? (
                      <img
                        src={group.imageUrl}
                        alt={group.name}
                        className="w-10 h-10 rounded-full object-cover border border-gray-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        {group.name.substring(0, 2)}
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                        {group.name}
                        {unread > 0 && (
                          <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                            {unread}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {group.members?.length || 0} חברים
                      </div>
                    </div>
                  </div>
                  {group.messages && group.messages.length > 0 && (
                    <div className="text-xs text-gray-400">
                      {formatTime(group.messages[0].createdAt)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div
        className={`flex-1 flex-col bg-slate-50 relative ${
          showChatOnMobile ? "flex w-full" : "hidden md:flex"
        }`}
      >
        {selectedUser || selectedGroup ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-white border-b border-gray-200 shadow-sm z-10 flex items-center justify-between sticky top-0">
              <div className="flex items-center gap-3">
                {/* Back Button for Mobile */}
                <button
                  className="md:hidden p-1 mr-[-8px] text-gray-500 hover:bg-gray-100 rounded-full"
                  onClick={() => {
                    setSelectedUser(null);
                    setSelectedGroup(null);
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-6 h-6 rotate-180" // rotate because RTL default maybe? arrow right is back in RTL
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                    />
                  </svg>
                </button>

                {selectedGroup &&
                  (selectedGroup.imageUrl ? (
                    <img
                      src={selectedGroup.imageUrl}
                      alt={selectedGroup.name}
                      className="w-10 h-10 rounded-full object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold shrink-0">
                      {selectedGroup.name.substring(0, 2)}
                    </div>
                  ))}
                <div>
                  <h3 className="font-semibold text-gray-800">
                    {selectedUser ? selectedUser.name : selectedGroup?.name}
                  </h3>
                  <span className="text-xs text-green-600">
                    {selectedUser
                      ? "מחובר (לכאורה)"
                      : `${selectedGroup?.members.length} חברים`}
                  </span>
                </div>
              </div>

              {/* Edit Group Button */}
              {selectedGroup && (
                <button
                  onClick={openEditGroupModal}
                  className="text-gray-400 hover:text-blue-600 p-2 rounded-full hover:bg-gray-100 transition"
                  title="ערוך קבוצה"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Messages */}
            <div
              className="flex-1 p-4 overflow-y-auto space-y-4"
              ref={scrollRef}
            >
              {loadingMessages ? (
                <div className="flex justify-center items-center h-full text-gray-400">
                  טוען הודעות...
                </div>
              ) : messages.length === 0 ? (
                <div className="flex justify-center items-center h-full text-gray-400">
                  אין הודעות עדיין. תגיד שלום!
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === currentUser.id;

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        isMe ? "items-end" : "items-start"
                      }`}
                    >
                      {/* Show sender name in groups if not me */}
                      {selectedGroup && !isMe && (
                        <span className="text-[10px] text-gray-500 mr-2 mb-1 px-1">
                          {msg.sender.name}
                        </span>
                      )}
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
                          !isMe
                            ? "bg-white text-gray-800 rounded-tl-none border border-gray-200"
                            : "bg-blue-600 text-white rounded-tr-none"
                        }`}
                      >
                        <div
                          className="text-sm"
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {msg.content}
                        </div>
                        <div
                          className={`text-[10px] mt-1 text-right ${
                            !isMe ? "text-gray-400" : "text-blue-200"
                          }`}
                        >
                          {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-gray-200">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="הקלד הודעה..."
                  className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="bg-blue-600 text-white rounded-full p-2 w-10 h-10 flex items-center justify-center hover:bg-blue-700 transition disabled:opacity-50 shrink-0"
                  title="שלח"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-5 h-5 ml-0.5"
                  >
                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                  </svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center text-gray-400 bg-slate-50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-16 h-16 mb-4 opacity-50"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
              />
            </svg>
            <p className="text-lg text-center px-4">
              בחר משתמש או קבוצה להתחלת שיחה
            </p>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {isCreateGroupModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setIsCreateGroupModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              יצירת קבוצה חדשה
            </h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                שם הקבוצה
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="לדוגמה: צוות מכירות"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                קישור לתמונה (אופציונלי)
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com/image.jpg"
                value={newGroupImage}
                onChange={(e) => setNewGroupImage(e.target.value)}
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                בחר משתתפים
              </label>
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      id={`user-${user.id}`}
                      checked={selectedMemberIds.includes(user.id)}
                      onChange={() => toggleMemberSelection(user.id)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label
                      htmlFor={`user-${user.id}`}
                      className="text-sm text-gray-700 cursor-pointer select-none"
                    >
                      {user.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsCreateGroupModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                ביטול
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={
                  !newGroupName.trim() || selectedMemberIds.length === 0
                }
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                צור קבוצה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Group Modal */}
      {isEditGroupModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              עריכת קבוצה
            </h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                שם הקבוצה
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="לדוגמה: צוות מכירות"
                value={editGroupName}
                onChange={(e) => setEditGroupName(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                קישור לתמונה (אופציונלי)
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com/image.jpg"
                value={editGroupImage}
                onChange={(e) => setEditGroupImage(e.target.value)}
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                בחר משתתפים
              </label>
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      id={`edit-user-${user.id}`}
                      checked={editMemberIds.includes(user.id)}
                      onChange={() => toggleMemberSelection(user.id, true)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label
                      htmlFor={`edit-user-${user.id}`}
                      className="text-sm text-gray-700 cursor-pointer select-none"
                    >
                      {user.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsEditGroupModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                ביטול
              </button>
              <button
                onClick={handleUpdateGroup}
                disabled={!editGroupName.trim() || editMemberIds.length === 0}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                שמור שינויים
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
