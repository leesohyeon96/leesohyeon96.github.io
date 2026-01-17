---
layout: post
title: "NAT vs Bridge"
date: 2024-11-13
category: concept
image: 
author: Sohyeon Lee
lang: en
permalink: /en/blog/nat_vs_bridge/
---


# Virtual Server Configuration and NAT vs Bridge Summary

<br/>

---

<br/>


## 🧩 Background
This post summarizes what I learned while observing virtual server implementation at work.<br/>
The provided operating system was **Windows OS**

<br/>

---

<br/>

## ⚙️ Process
Using virtualization software (VMware) on Windows, a total of **3 virtual machines (VMs)** were created:
- Application server
- DB server
- Other server (I don't remember the exact purpose)

When creating VMs, network configuration is required, and you typically choose between **two main methods: NAT and Bridge**  
These two methods differ significantly in how virtual machines communicate with external or internal networks

<br/>

---

<br/>

## 🌐 NAT vs Bridge – Differences Summary

| Category | NAT(Network Address Translation) | Bridge(Bridge Network) |
|----------|----------------------------------|--------------------------|
| IP Assignment | **Host OS** acts as DHCP server and assigns **internal IP** | **Direct IP allocation** from actual physical network (DHCP server or router) |
| External Communication | VM can communicate externally but **direct access from outside is not possible** | **Direct access from outside is possible** |
| Structure | External → **Host OS** → VM (via host) | External → **Direct VM access** |
| Security | Relatively **secure** (feels like internal network) | Can be exposed externally, **security configuration needed** |
| Use Case | Suitable for development/test environments | Production service environments, when communication between multiple devices is needed |
| Related Concept | Similar to **Jump Host** structure <br> (e.g., SSH connection using `ProxyCommand`) | **Uses independent IP like regular server** |

##### What is ProxyCommand?
- An option that defines a command to `create a tunnel through an intermediate server` before SSH connects to the final destination server
- [My Computer] -- SSH --> [Jump Host] -- SSH --> [Destination Server]
```
ssh -o "ProxyCommand ssh user@jump.example.com nc private.server.local 22" user@private.server.local
```
1) Access jump.example.com server via SSH
2) Connect to private.server.local:22 through intermediate nc command
3) Complete SSH connection to final server through tunnel


<br/>

---

<br/>

## 💡 Additional Explanation (Analogy)

**NAT**  
  → Similar to using a **router (Wi-Fi)** at home
  VM has a **private IP** (e.g., 192.168.x.x) and communicates externally **through the host**  
  External parties cannot directly access this VM

**Bridge**  
  → VM operates like a **regular PC directly connected via LAN cable**
  Receives public IP or private IP directly from router, enabling **equal communication** with other devices on the same network

<br/>

---

<br/>

## ✅ Summary

> **NAT** method is suitable for individual developer testing,  
> **Bridge** method is useful when configuring like an actual server
> It's important to choose the appropriate method based on security, accessibility, and network policies

